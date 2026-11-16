/**
 * The shapes of everything the AI produces for courses, with a validator for
 * each (CLAUDE.md rule 5: AI output is validated before it is stored).
 *
 * This file is shared: the Edge Function imports it to check model output,
 * and the app imports the types (through src/lib/course-content.ts) to read
 * the stored result. It must therefore stay free of imports and of anything
 * that exists only in Deno or only in React Native.
 *
 * Each *_SCHEMA constant is a JSON Schema handed to the model so it answers
 * in that shape. A JSON Schema cannot express every rule (lengths, "the
 * answer is one of the options"), so the validate* functions check again and
 * also clean the text (Unicode NFC, trimmed).
 */

export type Subject = 'language' | 'science' | 'general';
export type ItemKind = 'vocab' | 'grammar' | 'fact' | 'concept' | 'method';

export type CoursePlan = {
  title: string;
  summary: string;
  subject: Subject;
  /** ISO 639-1 code of the language being learned; '' unless subject is 'language'. */
  target_lang: string;
  /** false when the learner wants no week schedule; every lesson's week is then the same. */
  scheduled: boolean;
  /** The roadmap: a few stages, each with what the learner can do at its end. */
  stages: { title: string; outcome: string }[];
  lessons: {
    title: string;
    summary: string;
    objectives: string[];
    /** Timeline: week of the course, starting at 1. */
    week: number;
    /** Index into stages. */
    stage: number;
  }[];
};

/**
 * A piece of a step's text. `target` marks text in the language being
 * learned, so the app can read each piece aloud with the right voice.
 */
export type StepPart = { text: string; target: boolean };

/**
 * One card of a lesson's introduction, shown (and read aloud) on its own: a
 * headline, the idea in one sentence (`parts`) and one example.
 * Lessons prepared before the cards existed have steps with `parts` only.
 */
export type LessonStep = {
  /** The idea in a few words. */
  title?: string;
  parts: StepPart[];
  /** `text` is the example itself, `note` its translation or what it shows ('' when none). */
  example?: { text: string; note: string } | null;
};

export type LessonContent = {
  /** ISO 639-1 code of the language the explanation is written in (the learner's). */
  lang: string;
  steps: LessonStep[];
  key_points: string[];
  items: { kind: ItemKind; term: string; meaning: string; notes: string }[];
};

/**
 * The part of LessonContent kept on the lesson row (items become rows of
 * their own). Lessons prepared before the introduction was split into steps
 * have one text, `intro`, instead; src/lib/lesson-flow.ts reads both.
 */
export type LessonExplanation =
  | Pick<LessonContent, 'lang' | 'steps' | 'key_points'>
  | { intro: string; key_points: string[] };

/**
 * choice: pick one option. typed: type a word or phrase. build: put the
 * words of a sentence in order (language courses).
 */
export type QuestionKind = 'choice' | 'typed' | 'build';
export const QUESTION_KINDS: readonly QuestionKind[] = ['choice', 'typed', 'build'];

/** Practice as the model writes it: questions point at items by list position. */
export type Practice = {
  questions: {
    item: number;
    kind: QuestionKind;
    prompt: string;
    /** 3 or 4 options for 'choice'; empty for 'typed'; extra wrong words for 'build'. */
    options: string[];
    answer: string;
    explanation: string;
  }[];
};

/** Practice as stored on the lesson: questions carry the item's id. */
export type StoredPractice = {
  questions: (Omit<Practice['questions'][number], 'item'> & { item_id: string })[];
};

export type TutorReply = {
  reply: string;
  /** Instruction for the planner when the learner wants the plan changed; '' otherwise. */
  plan_change: string;
};

export type SourceRole = 'material' | 'exercises' | 'notes';
export const SOURCE_ROLES: readonly SourceRole[] = ['material', 'exercises', 'notes'];

/** An uploaded file (scan, photo, PDF) as AI read it. */
export type MaterialReading = {
  title: string;
  role: SourceRole;
  /** The content as Markdown, formulas in LaTeX; '' when nothing could be read. */
  text: string;
  readable: boolean;
};

/**
 * correct / partly / wrong: the graded outcome. unreadable: the photos could
 * not be read. open: not graded, because the learner asked for a hint.
 */
export type HomeworkVerdict = 'correct' | 'partly' | 'wrong' | 'unreadable' | 'open';
export const HOMEWORK_VERDICTS: readonly HomeworkVerdict[] = [
  'correct',
  'partly',
  'wrong',
  'unreadable',
  'open',
];
export type HomeworkMode = 'check' | 'hint';

/** What AI found in a handwritten homework solution. */
export type HomeworkCheck = {
  /** The task as text (read from the photo when it was not typed). */
  task: string;
  /** The solution as read from the photos. */
  transcription: string;
  verdict: HomeworkVerdict;
  /** 0 to 100; 0 when not graded. */
  score: number;
  summary: string;
  /** The learner's steps in order, each checked. */
  steps: { text: string; ok: boolean; comment: string }[];
  /** What to do next, without giving the solution away. */
  hint: string;
};

/** The part of HomeworkCheck kept in homework.result. */
export type HomeworkResult = Omit<HomeworkCheck, 'task' | 'transcription'>;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export const SUBJECTS: readonly Subject[] = ['language', 'science', 'general'];

/** The item kinds a course of each subject may contain. */
export const ITEM_KINDS: Record<Subject, readonly ItemKind[]> = {
  language: ['vocab', 'grammar'],
  science: ['fact', 'concept', 'method'],
  general: ['fact', 'concept', 'method'],
};

export const LIMITS = {
  goal: 2000,
  level: 500,
  /** Pasted course material, in characters (roughly 40,000 words). */
  material: 150_000,
  chatMessage: 4000,
  lessons: 60,
  stages: 8,
  itemsPerLesson: 12,
  /** Text AI reads out of one part of an uploaded file, in characters. */
  reading: 60_000,
  /**
   * All material of a course together, as given to the model for the plan
   * and for each lesson of a study course (roughly 150,000 tokens).
   */
  courseMaterial: 600_000,
  /**
   * Material given to the model for one lesson of a study course, in
   * characters: the sections chosen for the lesson. A course whose whole
   * material is shorter than this gets all of it.
   */
  lessonMaterial: 40_000,
  /** Sections chosen for one lesson. */
  lessonSections: 10,
  /** Photos of one homework solution. */
  solutionPages: 6,
  /** One uploaded file, in bytes (also the Storage bucket's limit). */
  uploadBytes: 10 * 1024 * 1024,
  /** Cards of one lesson's introduction. */
  steps: 6,
  /** Characters of a card's headline. */
  stepTitle: 60,
  /** Characters of a card's sentence. */
  stepText: 200,
  /** Characters of a card's example, and of the note under it. */
  stepExample: 200,
  questions: 10,
  term: 120,
} as const;

// --- JSON Schemas given to the model ----------------------------------------

const text = { type: 'string' } as const;
const textList = { type: 'array', items: text } as const;

function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

export const COURSE_PLAN_SCHEMA = object({
  title: text,
  summary: text,
  subject: { type: 'string', enum: SUBJECTS },
  target_lang: text,
  scheduled: { type: 'boolean' },
  stages: { type: 'array', items: object({ title: text, outcome: text }) },
  lessons: {
    type: 'array',
    items: object({
      title: text,
      summary: text,
      objectives: textList,
      week: { type: 'integer' },
      stage: { type: 'integer' },
    }),
  },
});

export const LESSON_CONTENT_SCHEMA = object({
  lang: text,
  steps: {
    type: 'array',
    items: object({
      title: text,
      parts: { type: 'array', items: object({ text, target: { type: 'boolean' } }) },
      example: object({ text, note: text }),
    }),
  },
  key_points: textList,
  items: {
    type: 'array',
    items: object({
      kind: { type: 'string', enum: ['vocab', 'grammar', 'fact', 'concept', 'method'] },
      term: text,
      meaning: text,
      notes: text,
    }),
  },
});

export const PRACTICE_SCHEMA = object({
  questions: {
    type: 'array',
    items: object({
      item: { type: 'integer' },
      kind: { type: 'string', enum: QUESTION_KINDS },
      prompt: text,
      options: textList,
      answer: text,
      explanation: text,
    }),
  },
});

export const TUTOR_REPLY_SCHEMA = object({ reply: text, plan_change: text });

export const SECTION_CHOICE_SCHEMA = object({ sections: { type: 'array', items: { type: 'integer' } } });

export const MATERIAL_READING_SCHEMA = object({
  readable: { type: 'boolean' },
  title: text,
  role: { type: 'string', enum: SOURCE_ROLES },
  text,
});

export const HOMEWORK_CHECK_SCHEMA = object({
  task: text,
  transcription: text,
  steps: {
    type: 'array',
    items: object({ text, ok: { type: 'boolean' }, comment: text }),
  },
  verdict: { type: 'string', enum: HOMEWORK_VERDICTS },
  score: { type: 'integer' },
  summary: text,
  hint: text,
});

// --- Validators --------------------------------------------------------------

/** Thrown inside a validator; turned into {ok: false} by run(). */
class Invalid extends Error {}

function run<T>(build: () => T): Validated<T> {
  try {
    return { ok: true, value: build() };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Invalid(`${where} is not an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Invalid(`${where} is not a list`);
  if (value.length < min || value.length > max) {
    throw new Invalid(`${where} has ${value.length} entries, expected ${min} to ${max}`);
  }
  return value;
}

/** A string, cleaned (NFC, trimmed). `max` is in characters; min 1 unless `optional`. */
function str(value: unknown, where: string, max: number, optional = false): string {
  if (typeof value !== 'string') throw new Invalid(`${where} is not text`);
  const cleaned = value.normalize('NFC').trim();
  if (cleaned === '' && !optional) throw new Invalid(`${where} is empty`);
  if (cleaned.length > max) throw new Invalid(`${where} is longer than ${max} characters`);
  return cleaned;
}

function int(value: unknown, where: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Invalid(`${where} is not a whole number from ${min} to ${max}`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, where: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Invalid(`${where} is not one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function strings(value: unknown, where: string, min: number, max: number, maxLength: number) {
  return list(value, where, min, max).map((entry, i) => str(entry, `${where}[${i}]`, maxLength));
}

/**
 * @param minWeek the first week new lessons may be planned for (1 for a new
 *   course; later when lessons already studied are kept).
 */
export function validateCoursePlan(value: unknown, minWeek = 1): Validated<CoursePlan> {
  return run(() => {
    const plan = record(value, 'plan');
    const subject = oneOf(plan.subject, 'subject', SUBJECTS);
    const targetLang = str(plan.target_lang, 'target_lang', 8, true).toLowerCase();
    if (subject === 'language' && !/^[a-z]{2,3}$/.test(targetLang)) {
      throw new Invalid('target_lang is not a language code');
    }
    const stages = list(plan.stages, 'stages', 1, LIMITS.stages).map((entry, i) => {
      const stage = record(entry, `stages[${i}]`);
      return {
        title: str(stage.title, `stages[${i}].title`, 120),
        outcome: str(stage.outcome, `stages[${i}].outcome`, 400),
      };
    });
    if (typeof plan.scheduled !== 'boolean') throw new Invalid('scheduled is not true or false');
    const scheduled = plan.scheduled;
    let week = minWeek;
    let stageIndex = 0;
    const lessons = list(plan.lessons, 'lessons', 1, LIMITS.lessons).map((entry, i) => {
      const where = `lessons[${i}]`;
      const lesson = record(entry, where);
      const result = {
        title: str(lesson.title, `${where}.title`, 120),
        summary: str(lesson.summary, `${where}.summary`, 600),
        objectives: strings(lesson.objectives, `${where}.objectives`, 1, 6, 300),
        // Without a schedule the weeks mean nothing; they are stored as one value.
        week: scheduled ? int(lesson.week, `${where}.week`, minWeek, 104) : minWeek,
        stage: int(lesson.stage, `${where}.stage`, 0, stages.length - 1),
      };
      // Lessons are in study order, so weeks and stages never go backwards.
      if (result.week < week) throw new Invalid(`${where}.week goes backwards`);
      if (result.stage < stageIndex) throw new Invalid(`${where}.stage goes backwards`);
      week = result.week;
      stageIndex = result.stage;
      return result;
    });
    return {
      title: str(plan.title, 'title', 120),
      summary: str(plan.summary, 'summary', 1000),
      subject,
      target_lang: subject === 'language' ? targetLang : '',
      scheduled,
      stages,
      lessons,
    };
  });
}

/** @param taken terms the course's deck already has; repeating one is an error. */
export function validateLessonContent(
  value: unknown,
  subject: Subject,
  taken: readonly string[] = [],
): Validated<LessonContent> {
  return run(() => {
    const content = record(value, 'lesson');
    const seen = new Set(taken.map((term) => term.normalize('NFC').trim().toLowerCase()));
    const items = list(content.items, 'items', 1, LIMITS.itemsPerLesson).map((entry, i) => {
      const where = `items[${i}]`;
      const item = record(entry, where);
      const term = str(item.term, `${where}.term`, LIMITS.term);
      if (seen.has(term.toLowerCase())) throw new Invalid(`${where}.term "${term}" is a duplicate`);
      seen.add(term.toLowerCase());
      return {
        kind: oneOf(item.kind, `${where}.kind`, ITEM_KINDS[subject]),
        term,
        meaning: str(item.meaning, `${where}.meaning`, 400),
        notes: str(item.notes, `${where}.notes`, 600, true),
      };
    });
    const lang = str(content.lang, 'lang', 8).toLowerCase();
    if (!/^[a-z]{2,3}$/.test(lang)) throw new Invalid('lang is not a language code');
    const steps = list(content.steps, 'steps', 2, LIMITS.steps).map((entry, i) => {
      const where = `steps[${i}]`;
      const step = record(entry, where);
      const title = str(step.title, `${where}.title`, LIMITS.stepTitle);
      const given = record(step.example, `${where}.example`);
      const exampleText = str(given.text, `${where}.example.text`, LIMITS.stepExample, true);
      // A card without an example is allowed; a note without one says nothing.
      const example =
        exampleText === ''
          ? null
          : {
              text: exampleText,
              note: str(given.note, `${where}.example.note`, LIMITS.stepExample, true),
            };
      const parts = list(step.parts, `${where}.parts`, 1, 12).map((piece, j) => {
        const part = record(piece, `${where}.parts[${j}]`);
        if (typeof part.text !== 'string') throw new Invalid(`${where}.parts[${j}].text is not text`);
        if (typeof part.target !== 'boolean') {
          throw new Invalid(`${where}.parts[${j}].target is not true or false`);
        }
        // Not trimmed: the spaces between pieces belong to the sentence.
        // Only a language course has text in a language being learned.
        return { text: part.text.normalize('NFC'), target: part.target && subject === 'language' };
      });
      const whole = parts.map((part) => part.text).join('').trim();
      if (whole === '') throw new Invalid(`${where} is empty`);
      if (whole.length > LIMITS.stepText) {
        throw new Invalid(`${where} is longer than ${LIMITS.stepText} characters; say it in one short sentence`);
      }
      return { title, parts: parts.filter((part) => part.text !== ''), example };
    });
    return {
      lang,
      steps,
      key_points: strings(content.key_points, 'key_points', 1, 8, 500),
      items,
    };
  });
}

/** A word as compared when a sentence is built from tiles: no punctuation, lower case. */
export function wordKey(word: string): string {
  return word.normalize('NFC').replace(/[.,!?;:"'。、！？]/g, '').toLowerCase();
}

/** @param itemCount number of items the questions may point at (0 … itemCount-1). */
export function validatePractice(
  value: unknown,
  itemCount: number,
  subject: Subject = 'language',
): Validated<Practice> {
  return run(() => {
    const practice = record(value, 'practice');
    const questions = list(practice.questions, 'questions', 1, LIMITS.questions).map((entry, i) => {
      const where = `questions[${i}]`;
      const question = record(entry, where);
      const kind = oneOf<QuestionKind>(question.kind, `${where}.kind`, QUESTION_KINDS);
      const answer = str(question.answer, `${where}.answer`, kind === 'typed' ? LIMITS.term : 300);
      let options: string[] = [];
      if (kind === 'build') {
        if (subject !== 'language') {
          throw new Invalid(`${where}.kind "build" is only for language courses`);
        }
        const words = answer.split(/\s+/).map(wordKey);
        if (words.length < 2 || words.length > 10) {
          throw new Invalid(`${where}.answer must be a sentence of 2 to 10 words`);
        }
        const extra = strings(question.options, `${where}.options`, 0, 5, 40);
        if (extra.some((word) => /\s/.test(word))) {
          throw new Invalid(`${where}.options must be single words`);
        }
        // A wrong word that is also in the sentence would make two orders right.
        options = [...new Set(extra)].filter((word) => !words.includes(wordKey(word)));
      }
      if (kind === 'choice') {
        options = strings(question.options, `${where}.options`, 3, 4, 300);
        if (new Set(options).size !== options.length) {
          throw new Invalid(`${where}.options repeats an option`);
        }
        if (!options.includes(answer)) {
          throw new Invalid(`${where}.answer is not one of its options`);
        }
      }
      return {
        item: int(question.item, `${where}.item`, 0, itemCount - 1),
        kind,
        prompt: str(question.prompt, `${where}.prompt`, 600),
        options,
        answer,
        explanation: str(question.explanation, `${where}.explanation`, 600, true),
      };
    });
    return { questions };
  });
}

export function validateTutorReply(value: unknown): Validated<TutorReply> {
  return run(() => {
    const reply = record(value, 'reply');
    return {
      reply: str(reply.reply, 'reply', 8000),
      plan_change: str(reply.plan_change, 'plan_change', 1500, true),
    };
  });
}

export function validateMaterialReading(value: unknown): Validated<MaterialReading> {
  return run(() => {
    const reading = record(value, 'reading');
    if (typeof reading.readable !== 'boolean') throw new Invalid('readable is not true or false');
    const body = str(reading.text, 'text', LIMITS.reading, true);
    // "Readable" with nothing read is not usable either.
    const readable = reading.readable && body !== '';
    return {
      readable,
      title: str(reading.title, 'title', 120, !readable) || 'Unreadable file',
      role: oneOf(reading.role, 'role', SOURCE_ROLES),
      text: readable ? body : '',
    };
  });
}

/** @param mode a hint is never graded: its verdict is 'open' and its score 0. */
export function validateHomeworkCheck(value: unknown, mode: HomeworkMode): Validated<HomeworkCheck> {
  return run(() => {
    const check = record(value, 'check');
    let verdict = oneOf(check.verdict, 'verdict', HOMEWORK_VERDICTS);
    let score = int(check.score, 'score', 0, 100);
    if (verdict === 'unreadable') {
      score = 0;
    } else if (mode === 'hint') {
      verdict = 'open';
      score = 0;
    } else if (verdict === 'open') {
      throw new Invalid('verdict "open" is only for hints; grade the solution');
    }
    const steps = list(check.steps, 'steps', 0, 40).map((entry, i) => {
      const step = record(entry, `steps[${i}]`);
      if (typeof step.ok !== 'boolean') throw new Invalid(`steps[${i}].ok is not true or false`);
      return {
        text: str(step.text, `steps[${i}].text`, 2000),
        ok: step.ok,
        comment: str(step.comment, `steps[${i}].comment`, 2000, true),
      };
    });
    return {
      task: str(check.task, 'task', 20_000, verdict === 'unreadable'),
      transcription: str(check.transcription, 'transcription', 40_000, true),
      verdict,
      score,
      summary: str(check.summary, 'summary', 3000),
      steps,
      hint: str(check.hint, 'hint', 3000, true),
    };
  });
}

/** The languages the app can be shown in; AI text is written in the chosen one. */
export const APP_LANGUAGES = ['en', 'de', 'es', 'ko'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
