/**
 * Types and limits of AI-written course content, as the app reads them from
 * the database. They are defined once, in the file the Edge Function uses to
 * validate the model's output, so both sides always agree.
 */
import type { StoredPractice } from '../../supabase/functions/_shared/course-schemas';

export {
  LIMITS,
  wordKey,
  type LessonExplanation,
  type HomeworkMode,
  type HomeworkResult,
  type HomeworkVerdict,
  type LessonStep,
  type SourceRole,
  type StoredPractice,
} from '../../supabase/functions/_shared/course-schemas';

export type Stage = { title: string; outcome: string };
export type Question = StoredPractice['questions'][number];
