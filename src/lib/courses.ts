/**
 * Loads courses and lessons for the screens. Only talks to the database;
 * the proficiency rules are in proficiency.ts, the AI calls in ai.ts.
 */
import type { LessonExplanation, Stage, StoredPractice } from '@/lib/course-content';
import {
  average,
  proficiencyByItem,
  type ProficiencyCard,
  type QuizAnswer,
} from '@/lib/proficiency';
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
  completed: boolean;
  /** Average proficiency of the lesson's items, 0..1; 0 before it is started. */
  proficiency: number;
};

export type CourseOverview = {
  id: string;
  goal: string;
  title: string | null;
  summary: string | null;
  stages: Stage[];
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
      .select('id, goal, title, summary, roadmap, planned_at')
      .eq('id', courseId)
      .single(),
    supabase
      .from('lessons')
      .select('id, position, week, stage, title, summary, prepared_at, completed_at')
      .eq('course_id', courseId)
      .order('position'),
  ]);
  const failed = course.error ?? lessons.error;
  if (failed) throw new Error(failed.message);
  if (!course.data) throw new Error('Course not found');
  const lessonRows = lessons.data ?? [];

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
    plannedAt: course.data.planned_at,
    lessons: lessonRows.map((l) => ({
      id: l.id,
      position: l.position,
      week: l.week,
      stage: l.stage,
      title: l.title,
      summary: l.summary,
      started: l.prepared_at !== null,
      completed: l.completed_at !== null,
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
  started: boolean;
  completed: boolean;
  /** Language being learned ('ko', ...) or null for other subjects. */
  targetLang: string | null;
  items: LessonItem[];
};

export async function loadLessonDetail(lessonId: string): Promise<LessonDetail> {
  const lesson = await supabase
    .from('lessons')
    .select('id, course_id, title, summary, objectives, explanation, practice, prepared_at, completed_at')
    .eq('id', lessonId)
    .single();
  if (lesson.error) throw new Error(lesson.error.message);

  const [course, items, answers] = await Promise.all([
    supabase.from('courses').select('deck_id').eq('id', lesson.data.course_id).single(),
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
    started: lesson.data.prepared_at !== null,
    completed: lesson.data.completed_at !== null,
    targetLang,
    items: itemRows.map(({ cards: _cards, ...item }) => ({ ...item, proficiency: scores[item.id] })),
  };
}
