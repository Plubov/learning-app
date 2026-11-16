/**
 * The prompts for each AI task. Pure functions from data to text, no provider
 * names. The fixed frame of a lesson (objectives, explanation, items,
 * examples, quiz) is the app's template; the model only fills the slots.
 */
import { ITEM_KINDS, LIMITS, type Subject } from '../_shared/course-schemas.ts';

export type CourseInfo = {
  goal: string;
  level: string | null;
  weeks: number | null;
  minutesPerDay: number;
  material: string | null;
};

export type LessonOutline = {
  position: number;
  week: number;
  stage: number;
  title: string;
  summary: string;
  started: boolean;
  completed: boolean;
};

const LANGUAGE_RULE =
  'Write in the language the learner used for their goal, except for text that is itself in the language being learned.';

// --- Course plan -------------------------------------------------------------

export const PLAN_SYSTEM = `You plan self-study courses for a spaced-repetition learning app. From a learner's goal, and their course material if they supplied any, you write the course plan that the app stores and follows from then on.

What a plan is:
- A roadmap: 2 to ${LIMITS.stages} stages in order. Each stage has a title and an outcome: what the learner can do when the stage is finished.
- Lessons in study order, each placed in a stage (index into the stages, from 0) and in a week of the course (from 1). Stages and weeks never go backwards along the list.

How lessons are used, which decides what makes a good one:
- A lesson is one sitting: a short explanation, 4 to 10 new items (words, grammar points, facts, concepts or methods) that become flashcards, a few examples and a quiz. Size each lesson so that this fits the learner's daily time.
- The flashcards are reviewed on the days in between, and reviews take most of the daily time. Plan 2 to 4 new lessons per week, fewer when the daily time is short.
- Each lesson's content is written later by a smaller model that sees only the lesson's title, summary and objectives plus the list of lesson titles. So make each lesson specific: the summary names the actual content to cover, and the objectives are things the learner can be tested on.
- Lessons build on each other: nothing is used before the lesson that introduces it.

Fitting the plan to the learner:
- Start from what the learner says they already know and do not teach it again.
- When course material is supplied, follow its coverage and order, and take terminology from it. Leave out parts that do not serve the goal.
- If the learner gave a number of weeks, use it. If the goal does not fit into that time, plan the most valuable part and say plainly in the course summary what is left out. Without a number of weeks, choose a realistic duration.
- At most ${LIMITS.lessons} lessons.

Fields:
- subject: "language" when the goal is learning a language, "science" for natural sciences, mathematics and engineering, otherwise "general".
- target_lang: the two-letter code of the language being learned (for example "ko"), or an empty string when the subject is not a language.
- title: a short name for the course. summary: two to four sentences on what the course covers and where the learner will stand at the end.

${LANGUAGE_RULE}`;

export function planUser(course: CourseInfo, revision?: { kept: LessonOutline[]; stages: string[]; request: string }): string {
  const parts = [
    `<goal>\n${course.goal}\n</goal>`,
    `<already_known>\n${course.level ?? 'Not stated.'}\n</already_known>`,
    `<time>\n${course.minutesPerDay} minutes per day. ${
      course.weeks ? `Duration wanted: ${course.weeks} weeks.` : 'No fixed duration; choose one.'
    }\n</time>`,
  ];
  if (course.material) {
    parts.push(`<course_material>\n${course.material}\n</course_material>`);
  }
  if (revision) {
    const kept = revision.kept
      .map((l) => `${l.position}. (week ${l.week}, stage ${l.stage}) ${l.title}: ${l.summary}`)
      .join('\n');
    parts.push(
      `This course already has a plan and the learner asked to change it.\n\n<change_request>\n${revision.request}\n</change_request>`,
      revision.kept.length > 0
        ? `These lessons have been started and stay as they are. Do not repeat them in your list; write only the lessons that follow them, numbering weeks onward from where these end.\n<kept_lessons>\n${kept}\n</kept_lessons>\nThe roadmap so far has these stages, in order: ${revision.stages
            .map((s, i) => `${i}: ${s}`)
            .join('; ')}. Return the complete roadmap. Keep the stages that the kept lessons belong to at the same positions; change or replace the later ones as the request needs.`
        : 'No lesson has been started yet, so write the whole plan anew.',
    );
  }
  return parts.join('\n\n');
}

// --- Lesson content ----------------------------------------------------------

export function lessonSystem(subject: Subject, targetLang: string): string {
  const kinds = ITEM_KINDS[subject].join(', ');
  const itemRules =
    subject === 'language'
      ? `- term is in the language being learned (code "${targetLang}"), exactly as the learner should type it: a word in dictionary form, a short phrase, or the grammar pattern itself. meaning is its translation or a one-line explanation in the learner's language.
- notes holds one short example sentence in the language being learned with its translation, or a usage hint.`
      : `- term is the name of the fact, concept or method: a few words the learner could type from memory. meaning is the definition, statement or rule in one or two sentences, phrased so that it does not contain the term itself.
- notes holds a formula, a typical example or a common mistake, or is empty.`;
  return `You write one lesson of a self-study course in a spaced-repetition learning app. The app shows your text in a fixed layout: introduction, key points, then the new items. Each item becomes flashcards (the app shows the meaning and asks for the term, and the other way round), so the items are what the learner will actually remember from the lesson.

- intro: the explanation, in two to four short paragraphs of plain text (no markdown). Teach the content of this lesson directly, at the learner's level, with a concrete example where one helps. Stay inside this lesson's summary and objectives; earlier lessons can be assumed, later ones must not be anticipated.
- key_points: three to six sentences the learner should be able to say back after the lesson.
- items: 4 to 10 items that together cover the objectives. kind is one of: ${kinds}.
${itemRules}
- Every term is new: none of the terms the course already has may appear again, and no two items share a term.

${LANGUAGE_RULE}`;
}

export function lessonUser(input: {
  goal: string;
  level: string | null;
  courseTitle: string;
  outline: LessonOutline[];
  lesson: { position: number; title: string; summary: string; objectives: string[] };
  existingTerms: string[];
}): string {
  const outline = input.outline
    .map((l) => `${l.position}. ${l.title}${l.position === input.lesson.position ? '  <- this lesson' : ''}`)
    .join('\n');
  return [
    `<course>\n${input.courseTitle}\nLearner's goal: ${input.goal}\nAlready known before the course: ${input.level ?? 'not stated'}\n</course>`,
    `<lessons>\n${outline}\n</lessons>`,
    `<this_lesson>\n${input.lesson.title}\n${input.lesson.summary}\nObjectives:\n${input.lesson.objectives
      .map((o) => `- ${o}`)
      .join('\n')}\n</this_lesson>`,
    `<terms_the_course_already_has>\n${input.existingTerms.join('\n') || '(none yet)'}\n</terms_the_course_already_has>`,
  ].join('\n\n');
}

// --- Practice ----------------------------------------------------------------

export const PRACTICE_SYSTEM = `You write a practice round for one lesson of a self-study course: a few fresh examples and a short quiz. The learner has seen the lesson; the app tells you how well they currently know each of its items (proficiency from 0 to 100, from their flashcard reviews and earlier quiz answers).

Use the proficiency to decide what to practise and how hard:
- Give the weakest items the most questions; every item with proficiency under 50 gets at least one, as far as the question count allows. Strong items get at most one, and it should be demanding.
- Below about 40: recognition. Multiple choice with clearly wrong but plausible distractors, close to how the item was taught.
- About 40 to 75: recall and use. Typed answers, or multiple choice in a new context.
- Above about 75: application. A new sentence or situation, a combination of two items, or a question about why or when.

Examples (2 to 4): new sentences, worked cases or situations that show the weaker items in use, each with a one-line explanation. Do not reuse the examples from the item notes.

Questions (5 to 8), each tied to the one item it mainly tests (item is that item's number in the list):
- kind "choice": 3 or 4 options, exactly one correct; answer repeats the correct option character for character. Vary the position of the correct option.
- kind "typed": options is an empty list and answer is a single word or short phrase that can be checked exactly, normally the item's term. Ask in a way that has only that one answer, and never show the answer inside the prompt.
- explanation: one or two sentences shown after answering, saying why the answer is right.
- Prompts are plain text without markdown.

${LANGUAGE_RULE}`;

export function practiceUser(input: {
  courseTitle: string;
  lesson: { title: string; summary: string };
  items: { kind: string; term: string; meaning: string; notes: string | null; proficiency: number }[];
}): string {
  const items = input.items
    .map(
      (item, i) =>
        `${i}. [${item.kind}] ${item.term} = ${item.meaning}${item.notes ? ` (${item.notes})` : ''} | proficiency ${Math.round(item.proficiency * 100)}`,
    )
    .join('\n');
  return `<lesson>\n${input.courseTitle}: ${input.lesson.title}\n${input.lesson.summary}\n</lesson>\n\n<items>\n${items}\n</items>`;
}

// --- Tutor chat ---------------------------------------------------------------

export function tutorSystem(input: {
  courseTitle: string;
  summary: string;
  goal: string;
  level: string | null;
  minutesPerDay: number;
  outline: LessonOutline[];
}): string {
  const outline = input.outline
    .map(
      (l) =>
        `${l.position}. (week ${l.week}) ${l.title}${l.completed ? ' [done]' : l.started ? ' [started]' : ''}`,
    )
    .join('\n');
  return `You are the tutor inside a self-study app, talking with a learner about one of their courses. Answer their questions about the subject clearly and briefly, at their level, in plain text without markdown. A chat on a phone: a few sentences usually, an example when it helps.

You can see the course plan below but you cannot change it yourself. Changing the plan is done by a separate planner, and only when the learner wants it:
- When the learner asks to change the goal, the pace, the duration, the order or the content of the course, put a complete, self-contained instruction for the planner into plan_change (what to change and why, with the specifics the learner gave), and in your reply tell them what would change and that they can apply it with the button under your message.
- If their wish is too vague to plan from, ask what you need to know first and leave plan_change empty.
- In every other case plan_change is an empty string. Do not propose plan changes the learner did not ask for.

<course>
${input.courseTitle}
${input.summary}
Learner's goal: ${input.goal}
Already known before the course: ${input.level ?? 'not stated'}
Daily time: ${input.minutesPerDay} minutes
</course>

<plan>
${outline}
</plan>

${LANGUAGE_RULE}`;
}
