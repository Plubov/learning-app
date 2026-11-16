# Product specification

Status: draft 1, 2026-11-11.

## Goal

A learning app whose core is a knowledge model: a per-user record of what the
learner knows and how well, built from every review, quiz and exercise. All
content shown to the learner is chosen or generated from that record.

Spaced repetition and active recall are the primary method. Everything else
supports them.

## Stages

1. Personal use: Carlos studies Korean with it every day.
2. Friends: shared as a web link and Android APK.
3. Public: app stores, privacy policy, optional paid managed AI.

## Platforms

Android (test device: Pixel 7), web browser (also the first way to use the
app on the iPad Air test tablet), later native iOS and iPadOS. Data syncs through one
backend; a user sees the same state on every device.

## The learning session

1. Due reviews, scheduled by FSRS. Always first, never skipped.
2. New items, capped per day (user setting).
3. A few exercises targeting the weakest items.

Exercise results are written to the same event log as card reviews and
influence mastery, but do not replace a scheduled review.

## Knowledge model

- Item: the smallest thing that can be known. For Korean: a word or a grammar
  point. For later subjects: a fact, concept or method.
- Card: one way of testing an item. One item has several cards.
- Exercise: a task that involves several items (a sentence, later a problem).
- Review event: one answer to one card or exercise.
- Mastery: per item, derived from the events.
- Prerequisite links between items (used from the science phase on).

## Korean (first subject)

Starting point: learner reads Hangul, knows a little basic vocabulary.

Card types:
- Recognition: Korean shown, recall the meaning.
- Production: meaning shown, type the Korean in Hangul. On the web (a
  computer usually has no Korean keyboard installed) Korean fields type
  Hangul from the Latin keys in the standard two-set layout (r = ㄱ, k = ㅏ)
  and show an on-screen Korean keyboard; "한 → A" switches to Latin letters.
  Keys count by position, as on a real Korean keyboard, so the computer's
  layout matters: US (QWERTY) or German (QWERTZ, Z and Y swapped). Chosen
  per device, first guessed from the browser language.
  Phones and tablets use their own Korean keyboard.
- Listening: Korean spoken by device text-to-speech, recall the meaning.

Exercise types:
- Cloze: sentence with one word or ending blanked out.
- Translation: short sentence, graded by AI against a reference answer.

Rule for generated sentences: use only items the learner has already been
introduced to, plus the items being targeted.

Grammar points (particles, verb endings, speech levels) are items like words.

Input paths:
- Import existing cards from a RemNote export.
- Paste a word list or text; AI proposes items and cards; the learner confirms
  before anything is saved.
- Later: upload files (PDF, images) and state learning goals.

## Courses (lessons beyond flashcards)

A course turns a learning goal into a plan and then into lessons. It works
for any subject; its items, cards and reviews are the same knowledge model as
everywhere else (a course owns a deck).

Creating a course: the learner states a goal, optionally what they already
know, minutes per day, a number of weeks, and pasted course material (a
syllabus, notes, a video transcript; at most 150,000 characters). Later: PDF
upload, then video (which needs transcription first).

AI is used in three places, and only there:

1. The plan, once per course, with the strong model: a roadmap (2 to 8
   stages, each with an outcome), the lessons in order, and a timeline (each
   lesson has a week). A learner who wants no schedule gets a plan without
   weeks: the lessons in order, at their own pace. It is made again only
   when the learner asks for a change. Lessons already started are kept; the rest is replaced.
2. A lesson's content, once per lesson, with the small model, when the
   learner presses "Start lesson": an introduction of 3 to 5 cards (each one
   idea: a headline, one sentence and one example, to be taken in at a
   glance; no running text), key points and 4 to 10 items. The items become cards and enter the normal daily reviews.
3. Practice, on demand, with the small model: 5 to 8
   questions (multiple choice, a typed answer, or, in language courses,
   building a sentence from word tiles), chosen and graded in difficulty
   from the learner's proficiency per item.

Everything else is fixed code. A lesson is always the same template (goals,
Learn, Practise, the lesson's items); the model only fills the slots.
Answers are checked in the app, not by AI.

The lesson page is a short overview. Learning and practising each open as a
full-screen session that shows one page at a time, with a progress bar, a
close button and a sound switch on top and the action at the bottom.

The guided run shows one thing at a time: the introduction cards, then the
new items in pairs, each pair followed by a quick check ("which one fits?",
built in the app from the lesson's own items), and the key points as a
recap. With "Auto sound" on, each page is read aloud by the device's
text-to-speech, switching voice between the learner's language and the
language being learned. The quick checks are a warm-up and are not stored;
only practice answers and card reviews enter the learning record.

A practice session opens with the lesson's items once more on one page
(term and meaning; tap to hear), then goes straight to the exercises. The
app adds its own exercises to the AI's questions, made from the lesson's
items without AI: matching pairs (the four weakest items) and, in language
courses, listening (hear the word, choose its meaning). After each answer a
green or red panel gives the verdict, the right answer and the explanation,
with a sound and a small animation. An exercise answered wrongly comes back
once at the end. The session ends with a result page (right at the first
try, best streak, points earned) and confetti. Every answer, including each
attempt at a pair, is stored in `review_events` with the kind of exercise
in `response.exercise`.

Sound: one stored switch turns automatic reading aloud and the sound
effects on or off, in reviews, lessons and practice. The effects are three
small WAV files in `assets/sounds/`, generated by `scripts/make-sounds.js`.

Proficiency (0 to 1 per item) is computed, never stored: from the FSRS state
of the item's cards (how stable the memory is, reduced when long overdue)
and the latest five quiz answers about it. A lesson's proficiency is the
average of its items. Rules: `src/lib/proficiency.ts`.

A lesson has two marks: learned (the guided run was finished once) and done
(the first finished practice session). The next lesson of a course is the
first one in order that is not done.

The home screen greets the learner with their total points and streak, then
shows today's goal (points and reviews, each with a progress bar) and the
next step: a large card for the course worked on most recently, naming the
next lesson, with a button that opens that lesson directly. Below it:
today's reviews, the other courses (each with its own next-lesson button),
and the word decks.

The course screen shows the course as a path: every lesson is a round stop
on a winding trail, every stage a signpost, the goal at the end. Finished
stops are green with one to three stars (from proficiency), the next one is
larger and pulses. Above the path: progress, the button into the next
lesson, and the course's tools.

A week schedule can be removed on the course screen without AI (the lessons
and their order stay); adding one back goes through the tutor. The course screen
shows the roadmap, how many lessons are done and, when the course has a
week schedule, the current week and whether the learner is behind.

Tutor chat: per course, with the small model. The learner asks questions
about the subject or asks to change the plan (goal, pace, order, topics).
The tutor cannot change the plan itself: it proposes the change, and the
learner applies it with a button, which runs the planner again.

## Handwriting and tablets (later phase)

Tablets run the same app with a wider layout. Handwriting is an input method
added to the existing model, in three steps of rising difficulty:

1. Writing cards: the learner writes a character or word by hand. First
   version is self-graded (correct form shown afterwards, learner rates).
   Second version checks the writing automatically with on-device handwriting
   recognition. Use: alphabets and scripts (Hangul, kana, Cyrillic, ...),
   and vocabulary production by hand.
2. Handwritten exercises: the learner solves a maths or physics problem by
   hand. Graded by self-assessment against a shown solution, or by sending an
   image of the work to an AI model that accepts images.
3. Handwritten notes: free pages attached to items, decks or sources.
   Deliberately minimal (pen, eraser, undo, pages); not a full note-taking app.

Principles:
- Handwriting is stored as strokes (points with time and pressure), not only
  as an image. Images are rendered from strokes when needed.
- Works with a finger on a phone; a stylus improves it but is not required.
- Recognition runs on the device where possible, so handwriting need not
  leave the device.

## AI connectivity

One internal interface, several interchangeable connections:

1. User's own API key (Anthropic, OpenAI, Google, others).
2. OpenRouter account connection (one-click, user pays OpenRouter).
3. Any OpenAI-compatible endpoint (self-hosted or local models).
4. Later: "Sign in with ChatGPT" plan usage, if open to this app.
5. Later: managed default model, billed by us.

Claude subscriptions cannot be connected; Anthropic permits API keys only.

The user picks connection and model in settings. One tested default model is
recommended. The app works without AI for plain reviewing.

Current state: one connection only. The server holds a single provider key as
an Edge Function secret, used for every account, with a daily limit of AI
calls per user. Code asks for a tier ('plan' = strong model, 'light' = small
model), never for a model; which model a tier means is decided in one place
on the server (today from secrets, later from the user's own choice), so
letting users pick their model needs no change to screens or prompts.

## Gamification

- Points: every answer earns points by how hard its kind of exercise is,
  and a wrong answer earns none. A matched pair 2; a multiple choice, a
  listening choice or a flashcard that is only looked at 5; a typed answer
  (in practice or on a flashcard) 10; a sentence built from word tiles 15.
  A flashcard earns its points unless it is rated "Again". The values live
  in one place, the database function `event_points`.
- Daily goal: two goals, and reaching either one completes the day: a
  number of reviews (default 20) or a number of points (default 100), both
  changeable on the statistics screen. Flashcard reviews earn points too,
  so the points goal can be reached by reviews, by practice, or by a mix.
  Reaching the day's goal shows a short celebration (🔥 with the streak, a
  short vibration), in a review or a practice session.
- Daily streak: days in a row with the goal reached. Today only breaks it
  once the day is over. Changing the goal never changes past days.
- Reminder notifications at a user-chosen time.
- Later: share card through the system share menu; accountability partners
  or small groups with shared streaks.
- Social media account linking: undecided.

## Privacy

- Accounts are separated by Row Level Security.
- Admin access to user content is restricted and, from the friends stage on,
  not used for looking at content.
- User API keys encrypted at rest. No logging of prompts or content. (The
  tutor chat is stored in the learner's own rows, like their other content.)
- Privacy policy before the friends stage; it names the AI provider the
  user's material is sent to. Account deletion built in.
- End-to-end encryption: not planned (incompatible with server-side AI).

## Out of scope for the first version

Offline mode, iOS build, file uploads, payments, social features,
self-hosting the backend, handwriting and tablet layout.

## Study courses

A second kind of course (`courses.kind = 'study'`), for university work. It
has everything a guided course has, and in addition:

Material. The learner uploads what the course gives them: scripts, slides,
exercise sheets (PDF), and photos or scans of handwritten notes. Files go
into the private Storage bucket `uploads`, under the user's own folder.
Text the learner already has (a lesson's script, typed notes) can be added
directly: it is stored as it is, without AI, and counts as read at once.

Adding files has two phases, so many files can be added in one go: everything is
uploaded first, then read in the background while the screen stays usable.
A PDF is cut on the device into parts of four pages before upload (a photo
is one part), because one AI call for a whole chapter runs longer than an
Edge Function may (150 seconds). Each call of the task `read_material`
(model tier 'read') reads the next part into Markdown text with formulas in
LaTeX and appends it to `sources.text`; two files are read at a time.
Reading can be interrupted and continued, and only files read to the end
are used. Handwriting is transcribed faithfully, not corrected. That text, not the file, is what
the rest of the app uses. A study course is created without a plan; the
learner adds material first and then has the plan made from it. Lessons and
practice of a study course are written from that material (see below), so
they follow the lecture's content and notation.

Homework. The learner gives a task (typed, or as a photo) and up to six
photos of their handwritten solution, and chooses "check" or "hint". AI
(task `check_homework`, strong model; `gradeAnswer` in the app) reads the
solution, splits it into the learner's steps and checks each one. A check
returns a verdict (correct, partly, wrong), a score from 0 to 100, a short
summary and how to fix it without writing out the solution. A hint is never
graded and only names the next step. Unreadable photos are reported as such.
The transcription is kept and shown, so a misread line can be noticed.

Photos are scaled to at most 1800 pixels on the longer side before upload.
Uploaded files are sent to the AI provider for reading; nothing else leaves
Supabase.

A lesson is written from the sections of the material that belong to it,
not from all of it. The material's text is cut into sections of at most
4,000 characters at its headings (the cut is deterministic, so a section is
remembered as "section n of source X"). When a lesson is prepared, a small
AI call (task `select_material`) sees one line per section (file, heading,
first words) and chooses up to ten; the choice is stored in
`lessons.material_refs` and reused for the lesson's practice. It is made
again when material was read after it. A course whose material is under
40,000 characters gets all of it without a choice. The plan still reads the
whole material once.

Not built yet: tasks suggested from the material, rendering of LaTeX
formulas (they are shown as text), homework results feeding the knowledge
model, and deleting a course's files when the course is deleted.

## Focus: active decks, priority, exams

Every deck (a course's cards are in its deck) has three study settings,
changed on the home screen (decks) or the course screen:

- Active or paused. The daily session and the daily goal draw from all
  active decks together. A paused deck keeps its cards and their schedule.
- Priority. Cards of priority decks come first in a session, and a priority
  course is the one the home screen offers to continue.
- Exam date. Until the exam, the deck's cards are scheduled by ts-fsrs with
  a maximum interval that ends the day before the exam, and in the last
  three weeks with a desired retention of 95% instead of 90%. In the last
  week, cards already scheduled for after the exam are brought into the
  session early. This only sets options ts-fsrs offers; there is no
  scheduling of our own (`src/lib/exam.ts`).

One deck can be studied on its own, whether active or paused: from its
course screen ("Flashcards"), from the deck screen, and from the home
screen once the daily goal is reached.

## Language

The app can be shown in English, German, Spanish and Korean; the choice is
on the home screen and stored on the device (the device's language is used
until one is chosen). The app's language is sent with every AI request, and
everything the AI writes is in it, except text in a language being learned.
Texts are in `src/lib/i18n/`; `en.ts` is the list of all keys. Translated so
far: home, course, lesson, and the learn and practice sessions. Still in
English: review, statistics, decks, import, sign-in, tutor chat, material
and homework screens, and error messages.

Voice: study courses are read in a calmer voice (slower and lower) than
guided courses.

What is read aloud: explanations (lesson steps, recap) are read; translations
of words and of example sentences are not. In a Korean course the text is
cut by its letters, so every stretch of Hangul gets the Korean voice and
everything else the voice of the learner's language, whatever the AI
labelled. Blanks and
grammar marks (`__`, `~`, a leading `-`) are never read. The voice per
language can be chosen on the voices screen.
