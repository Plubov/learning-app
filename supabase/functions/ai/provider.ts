/**
 * The provider-agnostic AI layer (CLAUDE.md rule 4). Everything outside the
 * adapter files talks to an AiProvider and never names a company or a model.
 *
 * A request asks for a *tier*, not a model:
 *   'plan'  - the strong model, used once per course plan, and wherever a
 *             mistake is costly: checking homework
 *   'light' - the small, cheap model for lesson content, practice and chat
 *   'read'  - the model that reads uploaded files into text: many pages, so
 *             speed and price matter, but formulas and handwriting must be right
 * The provider decides which model a tier means. Today that comes from the
 * function's secrets; when users choose their own model (ai_connections),
 * getProvider() is the one place that has to look at their choice.
 */
import { AnthropicProvider } from './anthropic.ts';

export type Tier = 'plan' | 'light' | 'read';

export type AiMessage = { role: 'user' | 'assistant'; content: string };

/** A file the model should look at: an image or a PDF, as base64. */
export type AiAttachment = { mediaType: string; base64: string };

export type AiRequest = {
  tier: Tier;
  system: string;
  messages: AiMessage[];
  /** Files shown to the model together with the first message, in this order. */
  attachments?: AiAttachment[];
  /** JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type AiResult = {
  /** The parsed answer; still unchecked beyond the schema. */
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** US dollars, or null when the model's price is not known. */
  costEstimate: number | null;
};

export interface AiProvider {
  /** The model a tier resolves to (also needed to log a failed call). */
  modelFor(tier: Tier): string;
  complete(request: AiRequest): Promise<AiResult>;
}

/** A failure with the HTTP status and message the app should see. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getProvider(): AiProvider {
  const name = Deno.env.get('AI_PROVIDER') ?? 'anthropic';
  if (name === 'anthropic') return new AnthropicProvider();
  throw new AiError(`Unknown AI provider "${name}"`, 500);
}
