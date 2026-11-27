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
 *   generate_practice  on demand: a quiz for the learner's level
 *   chat               one message to the tutor
 *   read_material      reads the next unread part of an uploaded file (photo,
 *                      scan, a few PDF pages) into text; called until all
 *                      parts are read
 *   check_homework     a handwritten solution is read and checked, or a hint
 *                      is given
 *
 * Rules kept here (CLAUDE.md): the provider key stays on the server, output
 * is validated before it is stored, every call writes one ai_usage row, and
 * prompts or answers are never logged.
 */
import { withSupabase, type SupabaseContext } from '@supabase/server';

import {
  APP_LANGUAGES,
  COURSE_PLAN_SCHEMA,
  HOMEWORK_CHECK_SCHEMA,
  LESSON_CONTENT_SCHEMA,
  LIMITS,
  MATERIAL_READING_SCHEMA,
  PRACTICE_SCHEMA,
  SECTION_CHOICE_SCHEMA,
  SUBJECTS,
  TUTOR_REPLY_SCHEMA,
  validateCoursePlan,
  validateHomeworkCheck,
  validateLessonContent,
  validateMaterialReading,
  validatePractice,
  validateTutorReply,
  type AppLanguage,
  type HomeworkMode,
  type HomeworkResult,
  type LessonDrill,
  type StoredPractice,
  type Subject,
  type Validated,
} from '../_shared/course-schemas.ts';
import { cleanChoice, sectionPreview, splitSections } from '../_shared/material-sections.ts';
import {
  AiError,
  getProvider,
  type AiAttachment,
  type AiMessage,
  type AiRequest,
} from './provider.ts';
import {
  homeworkSystem,
  homeworkUser,
  inLanguage,
  lessonSystem,
  lessonUser,
  PLAN_SYSTEM,
  planUser,
  PRACTICE_SYSTEM,
  practiceUser,
  READ_SYSTEM,
  readUser,
  SELECT_SYSTEM,
  selectUser,
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

/** The language the learner chose for the app, sent with every request; null from older app versions. */
function langOf(body: Body): AppLanguage | null {
  return APP_LANGUAGES.find((code) => code === body.lang) ?? null;
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
  material_refs: MaterialRef[] | null;
  material_at: string | null;
};

/** A section of a source's text: see ../_shared/material-sections.ts. */
type MaterialRef = { source: string; index: number };

const LESSON_COLUMNS =
  'id, course_id, position, week, stage, title, summary, objectives, prepared_at, completed_at, material_refs, material_at';

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
  kind: string;
  goal: string;
  level: string | null;
  weeks: number | null;
  minutes_per_day: number;
  source_id: string | null;
  deck_id: string | null;
  title: string | null;
  summary: string | null;
  roadmap: { title: string }[] | null;
  scheduled: boolean;
  planned_at: string | null;
};

async function loadCourse(ctx: Context, courseId: string): Promise<CourseRow> {
  return must(
    await ctx.supabase
      .from('courses')
      .select('id, kind, goal, level, weeks, minutes_per_day, source_id, deck_id, title, summary, roadmap, scheduled, planned_at')
      .eq('id', courseId)
      .maybeSingle(),
    'Course',
  ) as CourseRow;
}

type ReadSource = { id: string; title: string; role: string | null; text: string; read_at: string | null };

/**
 * Everything the learner gave the course as material, as texts: the text
 * pasted when the course was made, and every added file or text that has
 * been read to the end (half a chapter would look complete).
 */
async function readSources(ctx: Context, course: CourseRow): Promise<ReadSource[]> {
  const sources: ReadSource[] = [];
  if (course.source_id) {
    const pasted = must(
      await ctx.supabase.from('sources').select('id, text').eq('id', course.source_id).maybeSingle(),
      'Course material',
    ) as { id: string; text: string | null };
    if (pasted.text) {
      sources.push({ id: pasted.id, title: 'Pasted with the course', role: null, text: pasted.text, read_at: null });
    }
  }
  const files = must(
    await ctx.supabase
      .from('sources')
      .select('id, title, role, text, read_at')
      .eq('course_id', course.id)
      .not('read_at', 'is', null)
      .not('text', 'is', null)
      .order('created_at'),
    'Course files',
  ) as ReadSource[];
  return [...sources, ...files];
}

/** The whole material as one text, for the plan. Null when there is none. */
async function courseMaterial(ctx: Context, course: CourseRow): Promise<string | null> {
  const sources = await readSources(ctx, course);
  if (sources.length === 0) return null;
  const material = sources
    .map((file) => `# ${file.title}${file.role ? ` (${file.role})` : ''}\n\n${file.text}`)
    .join('\n\n---\n\n');
  // Never cut material silently: a plan from half a syllabus would look complete.
  if (material.length > LIMITS.courseMaterial) {
    throw new AiError(
      `The course material is ${material.length} characters long; at most ${LIMITS.courseMaterial} fit. Remove a file from the course.`,
      400,
    );
  }
  return material;
}

/**
 * The material one lesson of a study course is written from: only the
 * sections that belong to it. A small AI call chooses them from a list of
 * all sections (heading and first words of each); the choice is stored on
 * the lesson, so its practice uses the same sections without asking again.
 * The choice is made anew when material was read after it.
 */
async function lessonMaterial(
  ctx: Context,
  course: CourseRow,
  lesson: LessonRow,
  lang: AppLanguage | null,
): Promise<string | null> {
  if (course.kind !== 'study') return null;
  const sources = await readSources(ctx, course);
  if (sources.length === 0) return null;
  const all = sources.flatMap((source) =>
    splitSections(source.text).map((section, index) => ({ source, index, section })),
  );
  const render = (entries: typeof all) =>
    entries
      .map(({ source, section }) => `# ${source.title}: ${section.heading}\n\n${section.text}`)
      .join('\n\n---\n\n');

  // A small course fits whole; choosing would only risk leaving something out.
  const total = all.reduce((sum, entry) => sum + entry.section.text.length, 0);
  if (total <= LIMITS.lessonMaterial) return render(all);

  const latest = sources.reduce((max, s) => Math.max(max, s.read_at ? Date.parse(s.read_at) : 0), 0);
  let refs = lesson.material_refs;
  if (!refs || !lesson.material_at || Date.parse(lesson.material_at) < latest) {
    const outline = outlineOf(await loadOutline(ctx, course.id));
    const { value: chosen } = await runAi(
      ctx,
      'select_material',
      {
        tier: 'light',
        system: SELECT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: selectUser({
              courseTitle: course.title ?? '',
              outline,
              lesson,
              sections: all.map(
                ({ source, section }) =>
                  `[${source.title}${source.role ? `, ${source.role}` : ''}] ${section.heading}: ${sectionPreview(section)}`,
              ),
            }),
          },
        ],
        schema: SECTION_CHOICE_SCHEMA,
        maxTokens: 2000,
      },
      (value) => ({ ok: true, value: cleanChoice(value, all.length, LIMITS.lessonSections) }),
    );
    refs = chosen.map((n) => ({ source: all[n].source.id, index: all[n].index }));
    const saved = await ctx.supabase
      .from('lessons')
      .update({ material_refs: refs, material_at: new Date().toISOString() })
      .eq('id', lesson.id);
    if (saved.error) throw new AiError(`Database error (material): ${saved.error.message}`, 500);
  }

  const picked = refs
    .map((ref) => all.find((entry) => entry.source.id === ref.source && entry.index === ref.index))
    .filter((entry) => entry !== undefined);
  return picked.length > 0 ? render(picked) : null;
}

async function planCourse(ctx: Context, body: Body): Promise<void> {
  const course = await loadCourse(ctx, uuid(body.courseId, 'courseId'));
  if ((await usageSince(ctx, 'plan_course')) >= DAILY_PLANS) {
    throw new AiError('The daily limit for course plans is reached. Try again tomorrow.', 429);
  }
  const material = await courseMaterial(ctx, course);

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
      system: inLanguage(PLAN_SYSTEM, langOf(body)),
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
              ? {
                  kept,
                  stages: (course.roadmap ?? []).map((s) => s.title),
                  request,
                  scheduled: course.scheduled,
                }
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
      system: inLanguage(lessonSystem(subject, targetLang), langOf(body)),
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
            // A study course is taught from the student's own material.
            material: await lessonMaterial(ctx, course, lesson, langOf(body)),
          }),
        },
      ],
      schema: LESSON_CONTENT_SCHEMA,
      maxTokens: 8000,
    },
    (value) => validateLessonContent(value, subject, existingTerms),
  );

  // Items get their ids only when they are saved, so a drill names its item by the term.
  const drills: LessonDrill[] = content.drills.map(({ item, ...drill }) => ({
    ...drill,
    term: content.items[item].term,
  }));
  const saved = await ctx.supabase.rpc('save_lesson_content', {
    p_lesson_id: lesson.id,
    p_explanation: { lang: content.lang, steps: content.steps, key_points: content.key_points, drills },
    p_items: content.items,
  });
  if (saved.error) throw new AiError(`Database error (lesson): ${saved.error.message}`, 500);
}

async function generatePractice(ctx: Context, body: Body): Promise<void> {
  const { lesson, course, subject, targetLang } = await loadLesson(
    ctx,
    uuid(body.lessonId, 'lessonId'),
  );
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
      system: inLanguage(PRACTICE_SYSTEM, langOf(body)),
      messages: [
        {
          role: 'user',
          content: practiceUser({
            courseTitle: course.title ?? '',
            lesson,
            targetLang: subject === 'language' ? targetLang : '',
            items: withProficiency,
            material: await lessonMaterial(ctx, course, lesson, langOf(body)),
          }),
        },
      ],
      schema: PRACTICE_SCHEMA,
      maxTokens: 8000,
    },
    (value) => validatePractice(value, items.length, subject),
  );

  const stored: StoredPractice = {
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
      system: inLanguage(
        tutorSystem({
        courseTitle: course.title ?? '',
        summary: course.summary ?? '',
        goal: course.goal,
        level: course.level,
        minutesPerDay: course.minutes_per_day,
          scheduled: course.scheduled,
          outline: outlineOf(await loadOutline(ctx, course.id)),
        }),
        langOf(body),
      ),
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

const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * Loads an uploaded file from Storage as the logged-in user, so the bucket's
 * policies decide whether it may be read (only files in the user's folder).
 */
async function loadUpload(ctx: Context, path: string): Promise<AiAttachment> {
  const mediaType = MEDIA_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
  if (!mediaType) throw new AiError('This kind of file cannot be read. Use a photo or a PDF.', 400);
  const { data, error } = await ctx.supabase.storage.from('uploads').download(path);
  if (error || !data) throw new AiError('The uploaded file was not found.', 404);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length > LIMITS.uploadBytes) throw new AiError('The file is larger than 10 MB.', 400);
  // Checked before the model is called: an empty file would only cost a failed request.
  if (bytes.length < 200) {
    throw new AiError('The uploaded file is empty. Delete it and add it again.', 400);
  }
  // btoa takes a string of bytes; building it in pieces keeps large files
  // from overflowing the argument list.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { mediaType, base64: btoa(binary) };
}

/**
 * Reads the next unread part of a file and appends it to the source's text.
 * The app calls this until the file is read (read_at set). Reading in parts
 * keeps every call well under the time an Edge Function may run, and a file
 * half read can be continued later.
 */
async function readMaterial(ctx: Context, body: Body): Promise<void> {
  const source = must(
    await ctx.supabase
      .from('sources')
      .select('id, title, storage_path, part_paths, parts_read, text, read_at')
      .eq('id', uuid(body.sourceId, 'sourceId'))
      .maybeSingle(),
    'File',
  ) as {
    id: string;
    title: string;
    storage_path: string | null;
    part_paths: string[];
    parts_read: number;
    text: string | null;
    read_at: string | null;
  };
  if (source.read_at) return; // already read, e.g. on another device
  // Files uploaded before parts existed are one part: the whole file.
  const paths =
    source.part_paths.length > 0 ? source.part_paths : source.storage_path ? [source.storage_path] : [];
  if (paths.length === 0) throw new AiError('This source has no file', 409);
  const index = Math.min(source.parts_read, paths.length - 1);

  const file = await loadUpload(ctx, paths[index]);
  const { value: reading } = await runAi(
    ctx,
    'read_material',
    {
      tier: 'read',
      system: READ_SYSTEM,
      messages: [{ role: 'user', content: readUser(source.title, index + 1, paths.length) }],
      attachments: [file],
      schema: MATERIAL_READING_SCHEMA,
      maxTokens: 16_000,
    },
    validateMaterialReading,
  );
  if (!reading.readable && paths.length === 1) {
    throw new AiError('The file could not be read. Try a sharper photo with more light.', 422);
  }

  // An unreadable part of a longer file is marked, not fatal: the rest is still worth having.
  const partText = reading.readable ? reading.text : `[Part ${index + 1} of the file could not be read.]`;
  const done = index + 1 >= paths.length;
  const saved = await ctx.supabase
    .from('sources')
    .update({
      text: source.text ? `${source.text}\n\n${partText}` : partText,
      parts_read: index + 1,
      read_at: done ? new Date().toISOString() : null,
      // The first part names the file and says what it is.
      ...(index === 0 && reading.readable && { title: reading.title, role: reading.role }),
    })
    .eq('id', source.id)
    // Two devices reading the same file must not append the same part twice.
    .eq('parts_read', source.parts_read);
  if (saved.error) throw new AiError(`Database error (file): ${saved.error.message}`, 500);
}

async function checkHomework(ctx: Context, body: Body): Promise<void> {
  const homework = must(
    await ctx.supabase
      .from('homework')
      .select('id, course_id, task, task_path, solution_paths, mode')
      .eq('id', uuid(body.homeworkId, 'homeworkId'))
      .maybeSingle(),
    'Homework',
  ) as {
    id: string;
    course_id: string;
    task: string | null;
    task_path: string | null;
    solution_paths: string[];
    mode: HomeworkMode;
  };
  if (homework.solution_paths.length === 0) {
    throw new AiError('Add a photo of your solution first', 409);
  }
  const course = await loadCourse(ctx, homework.course_id);

  // A typed task wins over a photo of it; the photo is only read when needed.
  const taskPhoto = homework.task ? null : homework.task_path;
  const paths = [...(taskPhoto ? [taskPhoto] : []), ...homework.solution_paths];
  const attachments = await Promise.all(paths.map((path) => loadUpload(ctx, path)));

  const { value: check, model } = await runAi(
    ctx,
    'check_homework',
    {
      tier: 'plan',
      system: inLanguage(homeworkSystem(homework.mode), langOf(body)),
      messages: [
        {
          role: 'user',
          content: homeworkUser({
            courseTitle: course.title ?? '',
            goal: course.goal,
            task: homework.task,
            pages: homework.solution_paths.length,
          }),
        },
      ],
      attachments,
      schema: HOMEWORK_CHECK_SCHEMA,
      maxTokens: 16_000,
    },
    (value) => validateHomeworkCheck(value, homework.mode),
  );

  const result: HomeworkResult = {
    verdict: check.verdict,
    score: check.score,
    summary: check.summary,
    steps: check.steps,
    hint: check.hint,
  };
  const saved = await ctx.supabase
    .from('homework')
    .update({
      task: homework.task ?? (check.task || null),
      transcription: check.transcription,
      result,
      model,
      checked_at: new Date().toISOString(),
    })
    .eq('id', homework.id);
  if (saved.error) throw new AiError(`Database error (homework): ${saved.error.message}`, 500);
}

const TASKS: Record<string, (ctx: Context, body: Body) => Promise<void>> = {
  plan_course: planCourse,
  prepare_lesson: prepareLesson,
  generate_practice: generatePractice,
  chat,
  read_material: readMaterial,
  check_homework: checkHomework,
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
