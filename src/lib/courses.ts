/**
 * Loads courses and lessons for the screens. Only talks to the database;
 * the proficiency rules are in proficiency.ts, the AI calls in ai.ts.
 */
import type {
  LessonExplanation,
  Stage,
  StoredConversation,
  StoredPractice,
} from '@/lib/course-content';
import { courseProgress, type CourseProgress, type LessonProgress } from '@/lib/course-progress';
import {
  average,
  proficiencyByItem,
  type ProficiencyCard,
  type QuizAnswer,
} from '@/lib/proficiency';
import type { WrittenQuestion } from '@/lib/exercises';
import { supabase } from '@/lib/supabase';

/** Cards that exist from the start of an item (listening cards unlock later). */
const PROFICIENCY_CARD_TYPES = ['recognition', 'production'];
const CARD_COLUMNS = 'item_id, card_type, state, stability, scheduled_days, due_at, reps';
/** The API returns at most 1000 rows per request. */
const MAX_ROWS = 1000;

type CardRow = ProficiencyCard & { card_type: string };

export type CourseLesson = {
  id: string;
  position: number;
  week: number;
  stage: number;
  title: string;
  summary: string;
  started: boolean;
  /** The guided run ("Learn") was finished at least once. */
  learned: boolean;
  completed: boolean;
  /** The review stop after this lesson (if there is one) was finished. */
  reviewed: boolean;
  /** Average proficiency of the lesson's items, 0..1; 0 before it is started. */
  proficiency: number;
};

export type CourseOverview = {
  id: string;
  goal: string;
  title: string | null;
  summary: string | null;
  stages: Stage[];
  /** 'study' = a university course with uploaded material and homework. */
  kind: 'guided' | 'study';
    /** false = no week schedule: lessons in order, at the learner's own pace. */
  scheduled: boolean;
  /** The deck holding the course's cards, with its settings; null before the first plan. */
  deck: { id: string; active: boolean; priority: boolean; examDate: string | null } | null;
  plannedAt: string | null;
  lessons: CourseLesson[];
};

function relevantCards(cards: CardRow[]): CardRow[] {
  return cards.filter((card) => PROFICIENCY_CARD_TYPES.includes(card.card_type));
}

export async function loadCourseOverview(courseId: string): Promise<CourseOverview> {
  const [course, lessons] = await Promise.all([
    supabase
      .from('courses')
      .select('id, kind, goal, title, summary, roadmap, scheduled, planned_at, deck_id')
      .eq('id', courseId)
      .single(),
    supabase
      .from('lessons')
      .select('id, position, week, stage, title, summary, prepared_at, learned_at, completed_at, review_completed_at')
      .eq('course_id', courseId)
      .order('position'),
  ]);
  const failed = course.error ?? lessons.error;
  if (failed) throw new Error(failed.message);
  if (!course.data) throw new Error('Course not found');
    const lessonRows = lessons.data ?? [];
  const deck = course.data.deck_id
    ? await supabase
        .from('decks')
        .select('id, active, priority, exam_date')
        .eq('id', course.data.deck_id)
        .maybeSingle()
    : null;
  if (deck?.error) throw new Error(deck.error.message);


  // Proficiency only exists for started lessons: the others have no items yet.
  const startedIds = lessonRows.filter((l) => l.prepared_at !== null).map((l) => l.id);
  const byLesson: Record<string, number> = {};
  if (startedIds.length > 0) {
    const [items, answers] = await Promise.all([
      supabase
        .from('items')
        .select(`id, lesson_id, cards(${CARD_COLUMNS})`)
        .in('lesson_id', startedIds)
        .range(0, MAX_ROWS - 1)
        .overrideTypes<{ id: string; lesson_id: string; cards: CardRow[] }[], { merge: false }>(),
      supabase
        .from('review_events')
        .select('item_id, correct, reviewed_at')
        .in('lesson_id', startedIds)
        .order('reviewed_at', { ascending: false })
        .limit(MAX_ROWS),
    ]);
    const itemsFailed = items.error ?? answers.error;
    if (itemsFailed) throw new Error(itemsFailed.message);
    const itemRows = items.data ?? [];
    const scores = proficiencyByItem(
      itemRows.map((item) => item.id),
      relevantCards(itemRows.flatMap((item) => item.cards)),
      answers.data ?? [],
      new Date(),
    );
    for (const lessonId of startedIds) {
      byLesson[lessonId] = average(
        itemRows.filter((item) => item.lesson_id === lessonId).map((item) => scores[item.id]),
      );
    }
  }

  return {
    id: course.data.id,
    goal: course.data.goal,
    title: course.data.title,
    summary: course.data.summary,
    // Written by save_course_plan from validated output.
    stages: (course.data.roadmap ?? []) as Stage[],
    kind: course.data.kind === 'study' ? 'study' : 'guided',
        scheduled: course.data.scheduled,
    deck: deck?.data
      ? {
          id: deck.data.id,
          active: deck.data.active,
          priority: deck.data.priority,
          examDate: deck.data.exam_date,
        }
      : null,
    plannedAt: course.data.planned_at,
    lessons: lessonRows.map((l) => ({
      id: l.id,
      position: l.position,
      week: l.week,
      stage: l.stage,
      title: l.title,
      summary: l.summary,
      started: l.prepared_at !== null,
      learned: l.learned_at !== null,
      completed: l.completed_at !== null,
      reviewed: l.review_completed_at !== null,
      proficiency: byLesson[l.id] ?? 0,
    })),
  };
}

export type LessonItem = {
  id: string;
  kind: string;
  term: string;
  meaning: string;
  notes: string | null;
  proficiency: number;
};

export type LessonDetail = {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  objectives: string[];
  explanation: LessonExplanation | null;
  practice: StoredPractice | null;
  /** The latest conversation (language courses); null before the first. */
  conversation: StoredConversation | null;
  started: boolean;
  /** The guided run ("Learn") was finished at least once. */
  learned: boolean;
  completed: boolean;
    /** Language being learned ('ko', ...) or null for other subjects. */
  targetLang: string | null;
  /** A study (university) course: its lessons are read in the calm voice. */
  study: boolean;
  items: LessonItem[];
};

export async function loadLessonDetail(lessonId: string): Promise<LessonDetail> {
  const lesson = await supabase
    .from('lessons')
    .select(
      'id, course_id, title, summary, objectives, explanation, practice, conversation, prepared_at, learned_at, completed_at',
    )
    .eq('id', lessonId)
    .single();
  if (lesson.error) throw new Error(lesson.error.message);

  const [course, items, answers] = await Promise.all([
    supabase.from('courses').select('deck_id, kind').eq('id', lesson.data.course_id).single(),
    supabase
      .from('items')
      .select(`id, kind, term, meaning, notes, cards(${CARD_COLUMNS})`)
      .eq('lesson_id', lessonId)
      .order('term')
      .overrideTypes<(Omit<LessonItem, 'proficiency'> & { cards: CardRow[] })[], { merge: false }>(),
    supabase
      .from('review_events')
      .select('item_id, correct, reviewed_at')
      .eq('lesson_id', lessonId)
      .order('reviewed_at', { ascending: false })
      .limit(MAX_ROWS),
  ]);
  const failed = course.error ?? items.error ?? answers.error;
  if (failed) throw new Error(failed.message);

  let targetLang: string | null = null;
  if (course.data?.deck_id) {
    const deck = await supabase
      .from('decks')
      .select('target_lang')
      .eq('id', course.data.deck_id)
      .maybeSingle();
    targetLang = deck.data?.target_lang ?? null;
  }

  const itemRows = items.data ?? [];
  const answerRows: QuizAnswer[] = answers.data ?? [];
  const scores = proficiencyByItem(
    itemRows.map((item) => item.id),
    relevantCards(itemRows.flatMap((item) => item.cards)),
    answerRows,
    new Date(),
  );

  return {
    id: lesson.data.id,
    courseId: lesson.data.course_id,
    title: lesson.data.title,
    summary: lesson.data.summary,
    // The jsonb columns below are written only from validated AI output
    // (save_course_plan, save_lesson_content, the "ai" function).
    objectives: lesson.data.objectives as string[],
    explanation: lesson.data.explanation as LessonExplanation | null,
    practice: lesson.data.practice as StoredPractice | null,
    conversation: lesson.data.conversation as StoredConversation | null,
    started: lesson.data.prepared_at !== null,
    learned: lesson.data.learned_at !== null,
    completed: lesson.data.completed_at !== null,
        targetLang,
    study: course.data?.kind === 'study',
    items: itemRows.map(({ cards: _cards, ...item }) => ({ ...item, proficiency: scores[item.id] })),
  };
}

/** An item to review, with the lesson it belongs to. */
export type ReviewItem = LessonItem & { lessonId: string };

/** What a review stop needs: the items learned so far and the questions already written for them. */
export type ReviewData = {
  items: ReviewItem[];
  /** AI-written questions of those lessons (practice and drills), with the item they are about. */
  questions: { itemId: string; question: WrittenQuestion }[];
  targetLang: string | null;
  /** The language of the lessons' text (the learner's); null when unknown. */
  lang: string | null;
  study: boolean;
  /** "Lessons 1 to n". */
  upTo: number;
  reviewed: boolean;
};

/**
 * Loads a review stop: the items of every started lesson up to and including
 * `afterLessonId`, with their proficiency, and the questions written for
 * those lessons before (no AI call: the review reuses them).
 */
export async function loadReviewData(courseId: string, afterLessonId: string): Promise<ReviewData> {
  const [course, lessons] = await Promise.all([
    supabase.from('courses').select('deck_id, kind').eq('id', courseId).single(),
    supabase
      .from('lessons')
      .select('id, position, explanation, practice, prepared_at, review_completed_at')
      .eq('course_id', courseId)
      .order('position'),
  ]);
  const failed = course.error ?? lessons.error;
  if (failed) throw new Error(failed.message);
  const courseRow = course.data;
  if (!courseRow) throw new Error('Course not found');
  const lessonRows = lessons.data ?? [];
  const after = lessonRows.find((lesson) => lesson.id === afterLessonId);
  if (!after) throw new Error('Lesson not found');
  const covered = lessonRows.filter((lesson) => lesson.position <= after.position && lesson.prepared_at !== null);
  const coveredIds = covered.map((lesson) => lesson.id);

  const [items, answers, deck] = await Promise.all([
    supabase
      .from('items')
      .select(`id, lesson_id, kind, term, meaning, notes, cards(${CARD_COLUMNS})`)
      .in('lesson_id', coveredIds)
      .range(0, MAX_ROWS - 1)
      .overrideTypes<
        (Omit<LessonItem, 'proficiency'> & { lesson_id: string; cards: CardRow[] })[],
        { merge: false }
      >(),
    supabase
      .from('review_events')
      .select('item_id, correct, reviewed_at')
      .in('lesson_id', coveredIds)
      .order('reviewed_at', { ascending: false })
      .limit(MAX_ROWS),
    courseRow.deck_id
      ? supabase.from('decks').select('target_lang').eq('id', courseRow.deck_id).maybeSingle()
      : null,
  ]);
  const itemsFailed = items.error ?? answers.error ?? deck?.error;
  if (itemsFailed) throw new Error(itemsFailed.message);

  const itemRows = items.data ?? [];
  const scores = proficiencyByItem(
    itemRows.map((item) => item.id),
    relevantCards(itemRows.flatMap((item) => item.cards)),
    answers.data ?? [],
    new Date(),
  );

  // The jsonb columns are written only from validated AI output.
  const questions: ReviewData['questions'] = [];
  for (const lesson of covered) {
    const practice = lesson.practice as StoredPractice | null;
    for (const { item_id, ...question } of practice?.questions ?? []) questions.push({ itemId: item_id, question });
    const explanation = lesson.explanation as LessonExplanation | null;
    const drills = explanation && 'steps' in explanation ? (explanation.drills ?? []) : [];
    for (const { term, ...question } of drills) {
      const item = itemRows.find((row) => row.lesson_id === lesson.id && row.term === term);
      if (item) questions.push({ itemId: item.id, question });
    }
  }
  const last = covered[covered.length - 1]?.explanation as LessonExplanation | null | undefined;

  return {
    items: itemRows.map(({ cards: _cards, lesson_id, ...item }) => ({
      ...item,
      lessonId: lesson_id,
      proficiency: scores[item.id],
    })),
    questions,
    targetLang: deck?.data?.target_lang ?? null,
    lang: last && 'lang' in last ? last.lang : null,
    study: courseRow.kind === 'study',
    upTo: after.position,
    reviewed: after.review_completed_at !== null,
  };
}

/** Records that the review after a lesson was finished (the first time only). */
export async function markReviewDone(afterLessonId: string): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .update({ review_completed_at: new Date().toISOString() })
    .eq('id', afterLessonId)
    .is('review_completed_at', null);
  if (error) throw new Error(error.message);
}

/** A course as the home screen shows it: its name and where the learner stands. */
export type HomeCourse = CourseProgress & {
  id: string;
  title: string;
    /** false while the course has no plan yet (planning failed or was interrupted). */
  planned: boolean;
  /** The learner marked the course (its deck) as their priority. */
  priority: boolean;
};

/** All courses: priority ones first, then the one worked on most recently. */
export async function loadHomeCourses(): Promise<HomeCourse[]> {
  const starred = await supabase.from('decks').select('id').eq('priority', true);
  if (starred.error) throw new Error(starred.error.message);
  const priorityDecks = new Set((starred.data ?? []).map((deck) => deck.id));
  const { data, error } = await supabase
    .from('courses')
    .select(
      'id, title, goal, planned_at, created_at, deck_id, lessons(id, position, title, prepared_at, learned_at, completed_at, review_completed_at)',
    )
    // Plain projects (only a name, for the focus timer) live in the Focus tab.
    .neq('kind', 'project')
    .order('created_at', { ascending: false })
    .overrideTypes<
      {
        id: string;
        title: string | null;
        goal: string;
                planned_at: string | null;
        created_at: string;
        deck_id: string | null;
        lessons: LessonProgress[];
      }[],
      { merge: false }
    >();
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((course) => {
      const progress = courseProgress(course.lessons);
      return {
        ...progress,
        // A course never opened sorts by when it was created.
        lastActivity: progress.lastActivity || Date.parse(course.created_at),
        id: course.id,
        title: course.title ?? course.goal,
                planned: course.planned_at !== null,
        priority: course.deck_id !== null && priorityDecks.has(course.deck_id),
      };
    })
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.lastActivity - a.lastActivity);
}

/** Records that the guided run of a lesson was finished (the first time only). */
export async function markLessonLearned(lessonId: string): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .update({ learned_at: new Date().toISOString() })
    .eq('id', lessonId)
    .is('learned_at', null);
  if (error) throw new Error(error.message);
}

/** Turns off the week schedule of a course: lessons in order, at the learner's pace. */
export async function removeSchedule(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').update({ scheduled: false }).eq('id', courseId);
  if (error) throw new Error(error.message);
}

/** Changes a deck's study settings: in the daily session or paused, priority, exam date. */
export async function updateDeck(
  deckId: string,
  change: { active?: boolean; priority?: boolean; exam_date?: string | null },
): Promise<void> {
  const { error } = await supabase.from('decks').update(change).eq('id', deckId);
  if (error) throw new Error(error.message);
}
