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
- Production: meaning shown, type the Korean in Hangul.
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

## Gamification

- Daily streak with a clear rule (at least all due reviews or N minutes).
- Reminder notifications at a user-chosen time.
- Later: share card through the system share menu; accountability partners
  or small groups with shared streaks.
- Social media account linking: undecided.

## Privacy

- Accounts are separated by Row Level Security.
- Admin access to user content is restricted and, from the friends stage on,
  not used for looking at content.
- User API keys encrypted at rest. No logging of prompts or content.
- Privacy policy before the friends stage; it names the AI provider the
  user's material is sent to. Account deletion built in.
- End-to-end encryption: not planned (incompatible with server-side AI).

## Out of scope for the first version

Offline mode, iOS build, file uploads, payments, social features, subjects
other than Korean, self-hosting the backend, handwriting and tablet layout.
