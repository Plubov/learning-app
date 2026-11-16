/**
 * Adapter for the Anthropic API. The only file that knows this provider's
 * SDK, model names and prices. The key comes from the function secret
 * ANTHROPIC_API_KEY and never leaves the server (CLAUDE.md rule 3).
 *
 * Models can be changed without touching code:
 *   npx supabase secrets set AI_MODEL_PLAN=... AI_MODEL_LIGHT=... AI_MODEL_READ=...
 */
import Anthropic from '@anthropic-ai/sdk';

import {
  AiError,
  type AiAttachment,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type Tier,
} from './provider.ts';

const DEFAULT_MODELS: Record<Tier, string> = {
  plan: 'claude-opus-5-5',
  light: 'claude-haiku-5-5',
  read: 'claude-sonnet-5-5',
};

const MODEL_SECRETS: Record<Tier, string> = {
  plan: 'AI_MODEL_PLAN',
  light: 'AI_MODEL_LIGHT',
  read: 'AI_MODEL_READ',
};

/** How hard the model thinks: more for the one-time plan, little for daily content. */
const EFFORT: Record<Tier, 'low' | 'medium'> = { plan: 'medium', light: 'low', read: 'low' };

/** US dollars per million tokens: [input, output]. Used for the estimate in ai_usage only. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

/**
 * Edge Functions must answer within 150 seconds; stop a little before that.
 * For the same reason a failed call is not tried again here: a second try
 * after a slow first one would run past the limit, and the function would be
 * cut off without an answer or a usage row. The app offers "try again".
 */
const TIMEOUT_MS = 135_000;

export class AnthropicProvider implements AiProvider {
  modelFor(tier: Tier): string {
    const override = Deno.env.get(MODEL_SECRETS[tier]);
    return override || DEFAULT_MODELS[tier];
  }

  async complete(request: AiRequest): Promise<AiResult> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new AiError('AI is not set up yet: the server has no API key.', 503);
    }
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const model = this.modelFor(request.tier);

    let message: Anthropic.Message;
    try {
      // Streaming keeps the connection alive during long answers; only the
      // finished message is used.
      message = await client.messages
        .stream({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: withAttachments(request),
          output_config: {
            effort: EFFORT[request.tier],
            format: { type: 'json_schema', schema: request.schema },
          },
        })
        .finalMessage();
    } catch (error) {
      throw toAiError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new AiError('The AI model declined this request.', 422);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiError('The AI answer was cut off because it became too long.', 502);
    }
    const text = message.content.find((block) => block.type === 'text');
    let json: unknown;
    try {
      json = JSON.parse(text?.text ?? '');
    } catch {
      throw new AiError('The AI answer could not be read.', 502);
    }

    const usage = message.usage;
    const inputTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const price = PRICES[model];
    return {
      json,
      model,
      inputTokens,
      outputTokens: usage.output_tokens,
      costEstimate: price
        ? (inputTokens * price[0] + usage.output_tokens * price[1]) / 1_000_000
        : null,
    };
  }
}

type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function fileBlock(file: AiAttachment): Anthropic.ContentBlockParam {
  if (file.mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
    };
  }
  if (IMAGE_TYPES.includes(file.mediaType)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: file.mediaType as ImageType, data: file.base64 },
    };
  }
  throw new AiError('This kind of file cannot be read. Use a photo (JPEG, PNG) or a PDF.', 400);
}

/** The messages in this provider's form; attachments go in front of the first message's text. */
function withAttachments(request: AiRequest): Anthropic.MessageParam[] {
  const files = request.attachments ?? [];
  return request.messages.map((message, i) =>
    i === 0 && files.length > 0
      ? {
          role: message.role,
          content: [...files.map(fileBlock), { type: 'text' as const, text: message.content }],
        }
      : message,
  );
}

function toAiError(error: unknown): AiError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('The server\'s AI key was rejected. Check the ANTHROPIC_API_KEY secret.', 503);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('The AI key may not use this model.', 503);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('The configured AI model does not exist.', 503);
  }
  if (error instanceof Anthropic.BadRequestError) {
    // With files this is nearly always the file itself: too large, too many
    // pages, damaged or password-protected.
    return new AiError('The AI service could not accept this request. If it has a file, try a smaller or clearer one.', 400);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('The AI service is busy or out of credit. Try again in a minute.', 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('The AI service did not answer in time. Try again.', 504);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`The AI service returned an error (${error.status ?? 'unknown'}).`, 502);
  }
  return new AiError('The AI call failed.', 502);
}
