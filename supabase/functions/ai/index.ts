/**
 * Edge Function "ai": the only place the app's AI calls happen.
 *
 * The app sends {task, ...} with the logged-in user's token. Each task loads
 * what it needs from the database as that user (Row Level Security applies),
 * asks the model through the provider layer, validates the answer and stores
 * it. The app then reads the result from the database as usual.
 *
 * Tasks:
 *   plan_course        once per course, and again when the learner changes it
 *   prepare_lesson     once per lesson: explanation and items
 *   generate_practice  on demand: examples and a quiz for the learner's level
 *   chat               one message to the tutor
 *
 * Rules kept here (CLAUDE.md): the provider key stays on the server, output
 * is validated before it is stored, every call writes one ai_usage row, and
 * prompts or answers are never logged.
 */
import { withSupabase, type SupabaseContext } from '@supabase/server';

import {
  COURSE_PLAN_SCHEMA,
  LESSON_CONTENT_SCHEMA,
  LIMITS,
  PRACTICE_SCHEMA,
  SUBJECTS,
  TUTOR_REPLY_SCHEMA,
  validateCoursePlan,
  validateLessonContent,
  validatePractice,
  validateTutorReply,
  type StoredPractice,
  type Subject,
  type Validated,
} from '../_shared/course-schemas.ts';
import { AiError, getProvider, type AiMessage, type AiRequest } from './provider.ts';
import {
  lessonSystem,
  lessonUser,
  PLAN_SYSTEM,
  planUser,
  PRACTICE_SYSTEM,
  practiceUser,
  tutorSystem,
  type LessonOutline,
} from './prompts.ts';


type Context = SupabaseContext;
type Body = Record<string, unknown>;

/** Per user and 24 hours. The server's key is shared, so one account cannot spend without limit. */
const DAILY_CALLS = Number(Deno.env.get('AI_DAILY_CALLS') ?? 150);
const DAILY_PLANS = Number(Deno.env.get('AI_DAILY_PLANS') ?? 10);
const CHAT_HISTORY = 20;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new AiError(`${name} is missing`, 400);
  }
  return value;
}

/** Unwraps a database result; a missing row or an error becomes an AiError. */
function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new AiError(`Database error (${what}): ${result.error.message}`, 500);
  if (result.data === null) throw new AiError(`${what} not found`, 404);
  return result.data;
}

function userId(ctx: Context): string {
  const id = ctx.userClaims?.id;
  if (!id) throw new AiError('Not logged in', 401);
  return id;
}

async function usageSince(ctx: Context, task?: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = ctx.supabaseAdmin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId(ctx))
    .gte('created_at', since);
  if (task) query = query.eq('task', task);
  const { count, error } = await query;
  if (error) throw new AiError(`Database error (usage): ${error.message}`, 500);
  return count ?? 0;
}

async function logUsage(
  ctx: Context,
  row: { task: string; model: string; input_tokens: number; output_tokens: number; cost_estimate: number | null; ok: boolean },
): Promise<void> {
  const { error } = await ctx.supabaseAdmin
    .from('ai_usage')
    .insert({ ...row, user_id: userId(ctx) });
  // A failed log must not lose the learner's result, but it must be visible.
  if (error) console.error(`ai_usage insert failed for task ${row.task}: ${error.message}`);
}

/**
 * One AI task: call the model, validate, log. An answer that fails validation
 * is sent back once with the reason; a second failure is an error and nothing
 * is stored.
 */
async function runAi<T>(
  ctx: Context,
  task: string,
  request: AiRequest,
  validate: (value: unknown) => Validated<T>,
): Promise<{ value: T; model: string }> {
  const provider = getProvider();
  let messages = request.messages;
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try {
      result = await provider.complete({ ...request, messages });
    } catch (error) {
      await logUsage(ctx, {
        task,
        model: provider.modelFor(request.tier),
        input_tokens: 0,
        output_tokens: 0,
        cost_estimate: null,
        ok: false,
      });
      throw error;
    }
    const checked = validate(result.json);
    await logUsage(ctx, {
      task,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_estimate: result.costEstimate,
      ok: checked.ok,
    });
    if (checked.ok) return { value: checked.value, model: result.model };
    problem = checked.error;
    messages = [
      ...request.messages,
      { role: 'assistant', content: JSON.stringify(result.json) },
      {
        role: 'user',
        content: `That answer could not be used: ${problem}. Write the complete answer again with this corrected.`,
      },
    ];
  }
  throw new AiError(`The AI answer was not usable (${problem}). Try again.`, 502);
}

type LessonRow = {
  id: string;
  course_id: string;
  position: number;
  week: number;
  stage: number;
  title: string;
  summary: string;
  objectives: string[];
  prepared_at: string | null;
  completed_at: string | null;
};

const LESSON_COLUMNS =
  'id, course_id, position, week, stage, title, summary, objectives, prepared_at, completed_at';

async function loadOutline(ctx: Context, courseId: string): Promise<LessonRow[]> {
  return must(
    await ctx.supabase
      .from('lessons')
      .select(LESSON_COLUMNS)
      .eq('course_id', courseId)
      .order('position'),
    'lessons',
  ) as LessonRow[];
}

function outlineOf(lessons: LessonRow[]): LessonOutline[] {
  return lessons.map((l) => ({
    position: l.position,
    week: l.week,
    stage: l.stage,
    title: l.title,
    summary: l.summary,
    started: l.prepared_at !== null,
    completed: l.completed_at !== null,
  }));
}

type CourseRow = {
  id: string;
  goal: string;
  level: string | null;
  weeks: number | null;
  minutes_per_day: number;
  source_id: string | null;
  deck_id: string | null;
  title: string | null;
  summary: string | null;
  roadmap: { title: string }[] | null;
  planned_at: string | null;
};

async function loadCourse(ctx: Context, courseId: string): Promise<CourseRow> {
  return must(
    await ctx.supabase
      .from('courses')
      .select('id, goal, level, weeks, minutes_per_day, source_id, deck_id, title, summary, roadmap, planned_at')
      .eq('id', courseId)
      .maybeSingle(),
    'Course',
  ) as CourseRow;
}

async function planCourse(ctx: Context, body: Body): Promise<void> {
  const course = await loadCourse(ctx, uuid(body.courseId, 'courseId'));
  if ((await usageSince(ctx, 'plan_course')) >= DAILY_PLANS) {
    throw new AiError('The daily limit for course plans is reached. Try again tomorrow.', 429);
  }
  let material: string | null = null;
  if (course.source_id) {
    const source = must(
      await ctx.supabase.from('sources').select('text').eq('id', course.source_id).maybeSingle(),
      'Course material',
    ) as { text: string | null };
    material = source.text;
    // Never cut material silently: a plan from half a syllabus would look complete.
    if (material && material.length > LIMITS.material) {
      throw new AiError(`The course material is longer than ${LIMITS.material} characters.`, 400);
    }
  }

  const kept = course.planned_at
    ? outlineOf(await loadOutline(ctx, course.id)).filter((l) => l.started)
    : [];
  const request =
    typeof body.instructions === 'string' && body.instructions.trim() !== ''
      ? body.instructions.trim().slice(0, 2000)
      : 'Plan the rest of the course again for the goal, level and time as stated now.';
  const minWeek = kept.reduce((max, l) => Math.max(max, l.week), 1);

  const { value: plan, model } = await runAi(
    ctx,
    'plan_course',
    {
      tier: 'plan',
      system: PLAN_SYSTEM,
      messages: [
        {
          role: 'user',
          content: planUser(
            {
              goal: course.goal,
              level: course.level,
              weeks: course.weeks,
              minutesPerDay: course.minutes_per_day,
              material,
            },
            course.planned_at
              ? { kept, stages: (course.roadmap ?? []).map((s) => s.title), request }
              : undefined,
          ),
        },
      ],
      schema: COURSE_PLAN_SCHEMA,
      maxTokens: 24_000,
    },
    (value) => validateCoursePlan(value, minWeek),
  );

  const saved = await ctx.supabase.rpc('save_course_plan', {
    p_course_id: course.id,
    p_plan: plan,
    p_model: model,
  });
  if (saved.error) throw new AiError(`Database error (plan): ${saved.error.message}`, 500);
}

async function loadLesson(ctx: Context, lessonId: string) {
  const lesson = must(
    await ctx.supabase.from('lessons').select(LESSON_COLUMNS).eq('id', lessonId).maybeSingle(),
    'Lesson',
  ) as LessonRow;
  const course = await loadCourse(ctx, lesson.course_id);
  if (!course.deck_id) throw new AiError('The course has no plan yet', 409);
  const deck = must(
    await ctx.supabase.from('decks').select('subject, target_lang').eq('id', course.deck_id).maybeSingle(),
    'Deck',
  ) as { subject: string; target_lang: string | null };
  const subject: Subject = SUBJECTS.find((s) => s === deck.subject) ?? 'general';
  return { lesson, course, deckId: course.deck_id, subject, targetLang: deck.target_lang ?? '' };
}

async function prepareLesson(ctx: Context, body: Body): Promise<void> {
  const { lesson, course, deckId, subject, targetLang } = await loadLesson(
    ctx,
    uuid(body.lessonId, 'lessonId'),
  );
  if (lesson.prepared_at) return; // already done, e.g. on another device

  const outline = outlineOf(await loadOutline(ctx, course.id));
  const terms = must(
    await ctx.supabase.from('items').select('term').eq('deck_id', deckId).order('created_at').limit(1000),
    'items',
  ) as { term: string }[];
  const existingTerms = terms.map((t) => t.term);

  const { value: content } = await runAi(
    ctx,
    'prepare_lesson',
    {
      tier: 'light',
      system: lessonSystem(subject, targetLang),
      messages: [
        {
          role: 'user',
          content: lessonUser({
            goal: course.goal,
            level: course.level,
            courseTitle: course.title ?? '',
            outline,
            lesson,
            existingTerms,
          }),
        },
      ],
      schema: LESSON_CONTENT_SCHEMA,
      maxTokens: 8000,
    },
    (value) => validateLessonContent(value, subject, existingTerms),
  );

  const saved = await ctx.supabase.rpc('save_lesson_content', {
    p_lesson_id: lesson.id,
    p_explanation: { intro: content.intro, key_points: content.key_points },
    p_items: content.items,
  });
  if (saved.error) throw new AiError(`Database error (lesson): ${saved.error.message}`, 500);
}

async function generatePractice(ctx: Context, body: Body): Promise<void> {
  const { lesson, course } = await loadLesson(ctx, uuid(body.lessonId, 'lessonId'));
  if (!lesson.prepared_at) throw new AiError('Start the lesson first', 409);
  const items = must(
    await ctx.supabase
      .from('items')
      .select('id, kind, term, meaning, notes')
      .eq('lesson_id', lesson.id)
      .order('term'),
    'items',
  ) as { id: string; kind: string; term: string; meaning: string; notes: string | null }[];
  if (items.length === 0) throw new AiError('This lesson has no items to practise', 409);

  // Proficiency per item id, computed by the app (src/lib/proficiency.ts).
  const given = (typeof body.proficiency === 'object' && body.proficiency !== null
    ? body.proficiency
    : {}) as Record<string, unknown>;
  const withProficiency = items.map((item) => {
    const score = given[item.id];
    return {
      ...item,
      proficiency: typeof score === 'number' && score >= 0 && score <= 1 ? score : 0,
    };
  });

  const { value: practice } = await runAi(
    ctx,
    'generate_practice',
    {
      tier: 'light',
      system: PRACTICE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: practiceUser({ courseTitle: course.title ?? '', lesson, items: withProficiency }),
        },
      ],
      schema: PRACTICE_SCHEMA,
      maxTokens: 8000,
    },
    (value) => validatePractice(value, items.length),
  );

  const stored: StoredPractice = {
    examples: practice.examples,
    questions: practice.questions.map(({ item, ...question }) => ({
      ...question,
      item_id: items[item].id,
    })),
  };
  const saved = await ctx.supabase
    .from('lessons')
    .update({ practice: stored, practice_at: new Date().toISOString() })
    .eq('id', lesson.id);
  if (saved.error) throw new AiError(`Database error (practice): ${saved.error.message}`, 500);
}

async function chat(ctx: Context, body: Body): Promise<void> {
  const course = await loadCourse(ctx, uuid(body.courseId, 'courseId'));
  if (!course.planned_at) throw new AiError('The course has no plan yet', 409);
  const text = typeof body.message === 'string' ? body.message.normalize('NFC').trim() : '';
  if (text === '') throw new AiError('The message is empty', 400);
  if (text.length > LIMITS.chatMessage) {
    throw new AiError(`The message is longer than ${LIMITS.chatMessage} characters`, 400);
  }

  const recent = must(
    await ctx.supabase
      .from('course_messages')
      .select('role, content')
      .eq('course_id', course.id)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY),
    'messages',
  ) as AiMessage[];
  const history = recent.reverse();
  // A conversation sent to the model starts with the learner.
  while (history.length > 0 && history[0].role !== 'user') history.shift();

  const asked = await ctx.supabase
    .from('course_messages')
    .insert({ course_id: course.id, role: 'user', content: text });
  if (asked.error) throw new AiError(`Database error (message): ${asked.error.message}`, 500);

  const { value: reply } = await runAi(
    ctx,
    'chat',
    {
      tier: 'light',
      system: tutorSystem({
        courseTitle: course.title ?? '',
        summary: course.summary ?? '',
        goal: course.goal,
        level: course.level,
        minutesPerDay: course.minutes_per_day,
        outline: outlineOf(await loadOutline(ctx, course.id)),
      }),
      messages: [...history, { role: 'user', content: text }],
      schema: TUTOR_REPLY_SCHEMA,
      maxTokens: 4000,
    },
    validateTutorReply,
  );

  const answered = await ctx.supabase.from('course_messages').insert({
    course_id: course.id,
    role: 'assistant',
    content: reply.reply,
    plan_change: reply.plan_change || null,
  });
  if (answered.error) throw new AiError(`Database error (reply): ${answered.error.message}`, 500);
}

const TASKS: Record<string, (ctx: Context, body: Body) => Promise<void>> = {
  plan_course: planCourse,
  prepare_lesson: prepareLesson,
  generate_practice: generatePractice,
  chat,
};

const handle = withSupabase({ auth: 'user' }, async (req, ctx) => {
  let task = 'unknown';
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    task = typeof body?.task === 'string' ? body.task : 'unknown';
    const run = TASKS[task];
    if (!body || !run) throw new AiError('Unknown task', 400);
    if ((await usageSince(ctx)) >= DAILY_CALLS) {
      throw new AiError('The daily AI limit is reached. Try again tomorrow.', 429);
    }
    await run(ctx, body);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AiError) return json({ error: error.message }, error.status);
    // Only the error's type and message: never request or model content.
    console.error(`ai task ${task} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
});

/**
 * Browsers ask permission (an OPTIONS "preflight" request, without the login
 * token) before calling a function on another domain, and need these CORS
 * headers on every answer. Phones do not need them.
 */
export default {
  async fetch(req: Request): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        req.headers.get('Access-Control-Request-Headers') ??
        'authorization, x-client-info, apikey, content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const response = await handle(req);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
