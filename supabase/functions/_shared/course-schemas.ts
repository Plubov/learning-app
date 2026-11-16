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

export type LessonContent = {
  intro: string;
  key_points: string[];
  items: { kind: ItemKind; term: string; meaning: string; notes: string }[];
};

/** The part of LessonContent kept on the lesson row (items become rows of their own). */
export type LessonExplanation = Pick<LessonContent, 'intro' | 'key_points'>;

export type QuestionKind = 'choice' | 'typed';

/** Practice as the model writes it: questions point at items by list position. */
export type Practice = {
  examples: { text: string; explanation: string }[];
  questions: {
    item: number;
    kind: QuestionKind;
    prompt: string;
    /** 3 or 4 options for 'choice'; empty for 'typed'. */
    options: string[];
    answer: string;
    explanation: string;
  }[];
};

/** Practice as stored on the lesson: questions carry the item's id. */
export type StoredPractice = {
  examples: Practice['examples'];
  questions: (Omit<Practice['questions'][number], 'item'> & { item_id: string })[];
};

export type TutorReply = {
  reply: string;
  /** Instruction for the planner when the learner wants the plan changed; '' otherwise. */
  plan_change: string;
};

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
  intro: text,
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
  examples: { type: 'array', items: object({ text, explanation: text }) },
  questions: {
    type: 'array',
    items: object({
      item: { type: 'integer' },
      kind: { type: 'string', enum: ['choice', 'typed'] },
      prompt: text,
      options: textList,
      answer: text,
      explanation: text,
    }),
  },
});

export const TUTOR_REPLY_SCHEMA = object({ reply: text, plan_change: text });

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
    let week = minWeek;
    let stageIndex = 0;
    const lessons = list(plan.lessons, 'lessons', 1, LIMITS.lessons).map((entry, i) => {
      const where = `lessons[${i}]`;
      const lesson = record(entry, where);
      const result = {
        title: str(lesson.title, `${where}.title`, 120),
        summary: str(lesson.summary, `${where}.summary`, 600),
        objectives: strings(lesson.objectives, `${where}.objectives`, 1, 6, 300),
        week: int(lesson.week, `${where}.week`, minWeek, 104),
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
    return {
      intro: str(content.intro, 'intro', 4000),
      key_points: strings(content.key_points, 'key_points', 1, 8, 500),
      items,
    };
  });
}

/** @param itemCount number of items the questions may point at (0 … itemCount-1). */
export function validatePractice(value: unknown, itemCount: number): Validated<Practice> {
  return run(() => {
    const practice = record(value, 'practice');
    const examples = list(practice.examples, 'examples', 0, 6).map((entry, i) => {
      const example = record(entry, `examples[${i}]`);
      return {
        text: str(example.text, `examples[${i}].text`, 600),
        explanation: str(example.explanation, `examples[${i}].explanation`, 600, true),
      };
    });
    const questions = list(practice.questions, 'questions', 1, LIMITS.questions).map((entry, i) => {
      const where = `questions[${i}]`;
      const question = record(entry, where);
      const kind = oneOf<QuestionKind>(question.kind, `${where}.kind`, ['choice', 'typed']);
      const answer = str(question.answer, `${where}.answer`, kind === 'typed' ? LIMITS.term : 300);
      let options: string[] = [];
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
    return { examples, questions };
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
