# Setting up a new machine

Steps to get the project running on a second computer (e.g. the laptop).
Written for Windows; Mac differences are noted. Takes about 30 minutes.
When done, tick "pulled successfully on the second machine" in `ROADMAP.md`.

## 1. Install the tools

1. **Node.js, LTS version** from https://nodejs.org (the installer includes
   `npm` and `npx`). Node runs JavaScript outside the browser; Expo and the
   Supabase CLI are built on it.
2. **Git** from https://git-scm.com (Windows: keep the default options,
   including "Git Credential Manager").
3. **VS Code** from https://code.visualstudio.com.
4. **Claude Code**, then log in.

**Close and reopen every terminal and VS Code after installing.** A window
opened before the install does not find `node` or `npx` (error: "npx wurde
nicht als Name eines Cmdlet ... erkannt").

Check in a new terminal:

```
node -v
git --version
```

## 2. Get the code

In a terminal, in the folder where projects should live (e.g. `C:\Users\<you>`):

```
git clone https://github.com/Plubov/learning-app.git
cd learning-app
```

The repository is private, so the first clone opens a browser window to log
in to GitHub. If it fails, check you are logged in as the account that owns
the repository.

Then in VS Code: **File → Open Folder…** → `learning-app`, and open a terminal
with **Terminal → New Terminal**. All following commands run there.

## 3. Install the project's packages

```
npm install
```

This downloads everything listed in `package.json` into `node_modules/`
(not in git), including the Supabase CLI. Warnings from `npm audit` are
normal; do **not** run `npm audit fix --force` (it breaks Expo's versions).

## 4. Create `.env`

`.env` holds the Supabase settings and is not in git, so each machine needs
its own copy.

```
copy .env.example .env
```

(Mac: `cp .env.example .env`.) Open `.env` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL=https://kwyrtvjirgqzzxzdxpqu.supabase.co`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` the key starting with
  `sb_publishable_`, from the Supabase dashboard → Project Settings → API Keys
  (or copy the line from `.env` on the PC).

Never put the secret key here.

## 5. Connect the Supabase CLI

```
npx supabase login
npx supabase link --project-ref kwyrtvjirgqzzxzdxpqu
```

`login` opens the browser and shows a verification code to paste back.
`link` asks for the **database password** (not the Supabase login password;
nothing appears while typing). Forgotten? Reset it in the dashboard under
Project Settings → Database.

Check it works:

```
npx supabase migration list --remote
```

Every migration should show the same number under "local" and "remote".

## 6. Run the app

```
npx expo start
```

- Press `w` to open it in the browser.
- Scan the QR code with Expo Go on the phone (same Wi-Fi). If Windows asks
  whether Node.js may use the network, allow **private networks**.
- If the phone hangs on "Opening project…", stop with Ctrl+C and use
  `npx expo start --tunnel`.

## 7. Check everything

```
npx tsc --noEmit
npx expo lint
```

Both should finish without errors.

## Daily routine with two machines

- Before starting work: `git pull`, then `npm install` if `package.json`
  changed.
- After finishing: commit and `git push`, so the other machine can pull.
- Migrations: only ever create them in the repo and apply with
  `npx supabase db push --remote`; both machines talk to the same cloud
  database.
