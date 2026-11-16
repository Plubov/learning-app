/**
 * The app's side of the internal AI interface (CLAUDE.md rules 3 and 4).
 * Each function asks the Edge Function "ai" to do one task; the function
 * calls the model on the server, validates the answer and stores it. Nothing
 * here knows which provider or model is used, and no key is in the app.
 * After a call succeeds, the screens read the result from the database.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

async function callAi(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke('ai', { body });
  if (!error) return;
  let message = 'The AI service could not be reached. Check your connection and try again.';
  if (error instanceof FunctionsHttpError) {
    // The function answers errors as {"error": "sentence for the learner"}.
    const answer: unknown = await (error.context as Response).json().catch(() => null);
    if (typeof answer === 'object' && answer !== null && 'error' in answer) {
      message = String(answer.error);
    }
  }
  throw new Error(message);
}

/**
 * Writes the course plan (roadmap, timeline, lessons). Called once after a
 * course is created, and again only when the learner changes the goal or
 * asks the tutor for a different plan (`instructions`). Lessons already
 * started are kept. Can take a minute or two.
 */
export function planCourse(courseId: string, instructions?: string): Promise<void> {
  return callAi({ task: 'plan_course', courseId, instructions });
}

/** Writes a lesson's explanation and items. Once per lesson. */
export function prepareLesson(lessonId: string): Promise<void> {
  return callAi({ task: 'prepare_lesson', lessonId });
}

/**
 * Writes fresh examples and a quiz for a lesson.
 * @param proficiency 0..1 per item id (see proficiency.ts); decides what is
 *   practised and how hard.
 */
export function generatePractice(
  lessonId: string,
  proficiency: Record<string, number>,
): Promise<void> {
  return callAi({ task: 'generate_practice', lessonId, proficiency });
}

/** Sends one message to the course's tutor; the reply is stored in course_messages. */
export function askTutor(courseId: string, message: string): Promise<void> {
  return callAi({ task: 'chat', courseId, message });
}
