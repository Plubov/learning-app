/**
 * Material and homework of a study course. Only talks to the database and
 * Storage; the AI calls are in ai.ts, the file handling in uploads.ts.
 */
import type {
  HomeworkMode,
  HomeworkResult,
  HomeworkVerdict,
  SourceRole,
} from '@/lib/course-content';
import { supabase } from '@/lib/supabase';
import { cleanOptionalText, cleanText } from '@/lib/text';
import { partsOf, removeUploads, uploadFile, type PickedFile } from '@/lib/uploads';

export type Material = {
  id: string;
  title: string;
  role: SourceRole | null;
  /** The file's parts in Storage, in order (a photo is one part). */
  paths: string[];
  /** How many parts have been read so far. */
  partsRead: number;
  /**
   * Uploaded before files were split into parts: the whole file is one part,
   * which is too long to read in one call unless it is a single photo.
   */
  legacy: boolean;
  /** The text AI read from the file; null until all parts are read. */
  text: string | null;
};

export async function loadMaterials(courseId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, role, mime_type, storage_path, part_paths, parts_read, text, read_at')
    .eq('course_id', courseId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    // The column only ever holds one of the three roles (check constraint).
    role: row.role as SourceRole | null,
    // Files uploaded before parts existed are one part: the whole file.
    paths: row.part_paths.length > 0 ? row.part_paths : row.storage_path ? [row.storage_path] : [],
    partsRead: row.parts_read,
    legacy: row.part_paths.length === 0 && row.mime_type === 'application/pdf' && !row.read_at,
    text: row.read_at ? row.text : null,
  }));
}

/**
 * Uploads a file, in parts (see partsOf), and records it as a source of the
 * course, not yet read. Returns the source's id.
 * @param onPart called before each part is uploaded, for a progress line
 */
export async function addMaterial(
  courseId: string,
  file: PickedFile,
  onPart?: (part: number, parts: number) => void,
): Promise<string> {
  const parts = await partsOf(file);
  const paths: string[] = [];
  try {
    // One after the other, so the parts keep their order.
    for (const [i, part] of parts.entries()) {
      onPart?.(i + 1, parts.length);
      paths.push(await uploadFile(courseId, part));
    }
    const { data, error } = await supabase
      .from('sources')
      .insert({
        kind: 'file',
        title: file.name,
        part_paths: paths,
        mime_type: file.mimeType,
        course_id: courseId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (reason) {
    await removeUploads(paths).catch(() => {}); // do not leave files nobody points at
    throw reason;
  }
}

/**
 * A title for pasted text when the learner gave none: its first line, cut to
 * a readable length.
 */
export function titleFromText(text: string): string {
  const firstLine = cleanText(text).split('\n')[0].replace(/^#+\s*/, '').trim();
  if (firstLine === '') return 'Pasted text';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
}

/**
 * Adds text the learner already has (typed or pasted) as material of the
 * course. No AI is involved: the text is stored as it is and counts as read.
 */
export async function addTextMaterial(
  courseId: string,
  input: { title: string; text: string; role: SourceRole },
): Promise<void> {
  const text = cleanText(input.text);
  const { error } = await supabase.from('sources').insert({
    kind: 'paste',
    title: cleanText(input.title) || titleFromText(text),
    text,
    role: input.role,
    course_id: courseId,
    read_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteMaterial(material: Material): Promise<void> {
  const { error } = await supabase.from('sources').delete().eq('id', material.id);
  if (error) throw new Error(error.message);
  await removeUploads(material.paths);
}

export type Homework = {
  id: string;
  courseId: string;
  task: string | null;
  mode: HomeworkMode;
  pages: number;
  transcription: string | null;
  /** Null until it has been checked. */
  result: HomeworkResult | null;
  createdAt: string;
};

const HOMEWORK_COLUMNS =
  'id, course_id, task, mode, solution_paths, transcription, result, checked_at, created_at';

type HomeworkRow = {
  id: string;
  course_id: string;
  task: string | null;
  mode: string;
  solution_paths: string[];
  transcription: string | null;
  result: unknown;
  checked_at: string | null;
  created_at: string;
};

function toHomework(row: HomeworkRow): Homework {
  return {
    id: row.id,
    courseId: row.course_id,
    task: row.task,
    mode: row.mode === 'hint' ? 'hint' : 'check',
    pages: row.solution_paths.length,
    transcription: row.transcription,
    // Written only by the "ai" function from validated output.
    result: row.checked_at ? (row.result as HomeworkResult) : null,
    createdAt: row.created_at,
  };
}

/** The course's homework, newest first. */
export async function loadHomeworkList(courseId: string): Promise<Homework[]> {
  const { data, error } = await supabase
    .from('homework')
    .select(HOMEWORK_COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toHomework);
}

export async function loadHomework(homeworkId: string): Promise<Homework> {
  const { data, error } = await supabase
    .from('homework')
    .select(HOMEWORK_COLUMNS)
    .eq('id', homeworkId)
    .single();
  if (error) throw new Error(error.message);
  return toHomework(data);
}

/**
 * Uploads the photos and saves the homework, not yet checked. Returns its id.
 * The task is typed text, a photo, or both (the text is then used).
 */
export async function createHomework(
  courseId: string,
  input: { task: string; taskPhoto: PickedFile | null; pages: PickedFile[]; mode: HomeworkMode },
): Promise<string> {
  const task = cleanOptionalText(input.task);
  const uploaded: string[] = [];
  try {
    const taskPath = !task && input.taskPhoto ? await uploadFile(courseId, input.taskPhoto) : null;
    if (taskPath) uploaded.push(taskPath);
    const solutionPaths: string[] = [];
    // One after the other, so the pages keep their order.
    for (const page of input.pages) {
      const path = await uploadFile(courseId, page);
      uploaded.push(path);
      solutionPaths.push(path);
    }
    const { data, error } = await supabase
      .from('homework')
      .insert({
        course_id: courseId,
        task,
        task_path: taskPath,
        solution_paths: solutionPaths,
        mode: input.mode,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (reason) {
    await removeUploads(uploaded).catch(() => {});
    throw reason;
  }
}

export async function deleteHomework(homeworkId: string): Promise<void> {
  const { data, error } = await supabase
    .from('homework')
    .delete()
    .eq('id', homeworkId)
    .select('task_path, solution_paths')
    .single();
  if (error) throw new Error(error.message);
  await removeUploads([...(data.task_path ? [data.task_path] : []), ...data.solution_paths]);
}

/** How a verdict is shown: a symbol, a short title and whether it is good news. */
export function verdictLabel(verdict: HomeworkVerdict): { icon: string; title: string; good: boolean } {
  switch (verdict) {
    case 'correct':
      return { icon: '🏆', title: 'Correct!', good: true };
    case 'partly':
      return { icon: '🧩', title: 'Nearly there', good: true };
    case 'wrong':
      return { icon: '🔁', title: 'Not yet', good: false };
    case 'unreadable':
      return { icon: '📷', title: 'Could not read it', good: false };
    case 'open':
      return { icon: '💡', title: 'Your hint', good: true };
  }
}
