-- Study courses: a second kind of course, for university work. On top of the
-- plan and lessons every course has, a study course keeps
--   - uploaded material (lecture notes, exercise sheets, scans of handwritten
--     notes) as files in Storage, each read once by AI into text, and
--   - homework: a task plus photos of the handwritten solution, which AI
--     reads and checks.
-- See "Study courses" in docs/SPEC.md.

alter table public.courses
  add column kind text not null default 'guided' check (kind in ('guided', 'study'));

-------------------------------------------------------------------------------
-- sources: a source can now belong to a course and be a file in Storage.
-- storage_path and kind 'file' exist since the table was made.
-------------------------------------------------------------------------------
alter table public.sources
  add column course_id uuid,
  add column mime_type text,
  -- What the file is, as AI judged it when reading: lecture material, an
  -- exercise sheet, or the learner's own notes.
  add column role text check (role in ('material', 'exercises', 'notes')),
  -- When AI read the file into `text`; null = not read yet.
  add column read_at timestamptz;

-- Deleting a course deletes its sources (the files are removed by the app).
alter table public.sources
  add constraint sources_course_fkey foreign key (course_id, user_id)
  references public.courses (id, user_id) on delete cascade;
create index sources_course_id_idx on public.sources (course_id);

-------------------------------------------------------------------------------
-- homework: one task and the learner's handwritten solution, with what AI
-- read and found. A row can be checked again (e.g. after adding a page); the
-- latest result replaces the one before.
-------------------------------------------------------------------------------
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  -- The task: typed, or read by AI from task_path (a photo of the task).
  task text check (length(task) <= 20000 and task is nfc normalized),
  task_path text,
  -- Photos of the solution in Storage, in page order.
  solution_paths text[] not null default '{}' check (cardinality(solution_paths) <= 6),
  -- 'check' = grade the finished solution; 'hint' = help with the next step.
  mode text not null default 'check' check (mode in ('check', 'hint')),
  -- The solution as AI read it (text, formulas in LaTeX).
  transcription text check (transcription is nfc normalized),
  -- {"verdict": "correct" | "partly" | "wrong" | "unreadable" | "open",
  --  "score": 0..100, "summary": "...",
  --  "steps": [{"text": "...", "ok": true, "comment": "..."}], "hint": "..."}
  result jsonb,
  model text,
  checked_at timestamptz,  -- null = not checked yet
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (task is not null or task_path is not null),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);

create index homework_user_id_idx on public.homework (user_id);
create index homework_course_id_created_at_idx on public.homework (course_id, created_at);

alter table public.homework enable row level security;

create policy "homework: owner can read" on public.homework
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "homework: owner can insert" on public.homework
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "homework: owner can update" on public.homework
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "homework: owner can delete" on public.homework
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger homework_set_updated_at before update on public.homework
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Storage: one private bucket for everything a learner uploads. A file's
-- path starts with the owner's user id ("<user id>/<course id>/<file>"), and
-- the policies allow access only inside one's own folder. Files are never
-- public; the app and the Edge Function read them with the user's login.
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 10485760,  -- 10 MB
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "uploads: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: owner can add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
