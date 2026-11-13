# Roadmap

Current milestone: M2

## M0 Setup (one or two evenings)

On PC and laptop:
- [ ] Install Node.js (LTS version), Git, VS Code
- [ ] Claude Code is installed and logged in

Accounts (all free to start):
- [ ] GitHub; create a private repository and clone it on both machines
- [x] Supabase Cloud; create one project in an EU region
- [ ] Expo account
- [ ] One AI API account with a small prepaid credit (needed from M3)

Project:
- [x] Copy `CLAUDE.md` and `docs/` into the repository
- [x] Scaffold the Expo app with TypeScript (`npx create-expo-app@latest`)
- [x] App starts in the browser and on the Pixel 7 via Expo Go
      (if the Play Store version of Expo Go does not yet support the newest
      SDK, let Expo CLI install the matching version on the phone, or choose
      the previous SDK when `create-expo-app` asks)
- [ ] App opens in Safari on the iPad Air (same Wi-Fi, dev server address)
- [x] Supabase CLI set up; first empty migration applied
- [x] `.env` with Supabase URL and public key; `.env` is in `.gitignore`
- [x] Fill in the Commands section of `CLAUDE.md`
- [x] First commit pushed; pulled successfully on the second machine

## M1 Review loop (target: daily Korean study starts here)

- [x] Sign up and log in
- [x] Tables: decks, items, cards, review_events, profiles, with RLS
- [x] Add and edit items by hand; cards are created per item
- [x] Review screen: due cards, four rating buttons, FSRS scheduling
- [x] Recognition and production cards; typed Hangul answers checked
- [x] Same state on phone and browser
- [x] Unit tests for scheduling and answer comparison

## M2 Import and audio

- [x] Import from a RemNote export file
- [x] Learning order for new words: topics mixed, phrases after their words
- [x] Korean read aloud with device text-to-speech
- [ ] Listening cards (hear the word, then answer)
      (migration applied and in the repo; the app code may still be
      uncommitted on the first PC, check `git status` there)
- [x] Daily cap for new items, with "Learn more"
- [ ] Simple statistics screen

## M3 AI generation

- [ ] Edge Function with the internal AI interface and one provider adapter
- [ ] ai_connections and ai_usage; own API key entered in settings
- [ ] Paste a word list or text, review proposed items, confirm to save
- [ ] Output validation against a schema
- [ ] AI-assigned level per word (e.g. TOPIK 1–6), used to introduce common
      words first (learning order rule "frequency")

## M4 Knowledge model and exercises

- [ ] item_mastery view; mastery overview screen
- [ ] Grammar items
- [ ] Cloze and translation exercises generated for weak items
- [ ] Session order: due reviews, new items, exercises

## M5 Habit

- [ ] daily_activity and streak
- [ ] Development build (EAS) and push reminder notifications
- [ ] More AI connections: OpenRouter, OpenAI-compatible endpoint

## M6 Friends

- [ ] Web version deployed under a domain; APK for Android friends
- [ ] Privacy policy, account deletion, per-user AI limits
- [ ] Decide: stay on Supabase Cloud or move to the Hostinger VPS (8 GB RAM)
- [ ] Share cards and accountability groups

## M7 Handwriting, step 1

Test tablet: iPad Air (5th generation). No Mac of our own; occasional access
to a borrowed MacBook and iPhone. The regular workflow must not depend on
them.

Stage A, web in Safari on the iPad (no Apple account needed):
- [ ] Drawing canvas (React Native Skia) on phone, tablet and web
- [ ] Stylus input checked in Safari (pressure, palm contact)
- [ ] Strokes stored in `drawings`; 'writing' card type, self-graded
- [ ] Tablet layout (wider screens)

Optional check between A and B, on the borrowed Mac (free):
- [ ] Build the app with Xcode and Carlos's own free Apple account, install
      it on the iPad, and confirm that handwriting recognition works before
      paying for the membership. The installed app stops opening after 7 days.
- [ ] Use Safari's Web Inspector on the Mac to debug the web version running
      on the iPad

Stage B, native iPad app (needs paid Apple Developer Program membership):
- [ ] iOS development build through EAS (cloud build, no Mac required)
- [ ] On-device recognition (ML Kit Digital Ink) to check written Korean,
      on Android and iPad; self-grading stays as the fallback on web

## Later

Physics and science items with prerequisite links, handwritten maths
exercises graded from an image, minimal handwritten notes, file uploads,
offline mode, iOS and iPad, Play Store closed test (12 testers for 14 days),
managed AI with payment, "Sign in with ChatGPT".
