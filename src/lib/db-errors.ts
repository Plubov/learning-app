type DbError = { code?: string; message: string };

/** Turns a Supabase/Postgres error into a sentence for the learner. */
export function describeDbError(error: DbError, duplicateMessage: string): string {
  // 23505 = unique_violation (e.g. the same word twice in one deck).
  if (error.code === '23505') {
    return duplicateMessage;
  }
  return error.message;
}
