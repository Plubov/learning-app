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
   lesson has a week). It is made again only when the learner asks for a
   change. Lessons already started are kept; the rest is replaced.
2. A lesson's content, once per lesson, with the small model, when the
   learner presses "Start lesson": an explanation, key points and 4 to 10
   items. The items become cards and enter the normal daily reviews.
3. Practice, on demand, with the small model: fresh examples and a quiz of 5
   to 8 questions (multiple choice or a typed answer), chosen and graded in
   difficulty from the learner's proficiency per item.

Everything else is fixed code. A lesson is always the same template (goals,
explanation, items to remember, examples, quiz); the model only fills the
slots. Quiz answers are checked in the app, not by AI.

Proficiency (0 to 1 per item) is computed, never stored: from the FSRS state
of the item's cards (how stable the memory is, reduced when long overdue)
and the latest five quiz answers about it. A lesson's proficiency is the
average of its items. Rules: `src/lib/proficiency.ts`.

A lesson counts as done after its first finished quiz. The course screen
shows the roadmap, the current week, how many lessons are done and whether
the learner is behind the timeline.

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

- Daily goal: a number of reviews per day (default 20, changeable on the
  statistics screen). Reaching it shows a short celebration (🔥 with the
  streak, a short vibration).
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
