# Real-time sync setup (Firebase)

Docket works fully offline out of the box (IndexedDB only, single browser).
This turns on **live, multi-user sync** — everyone in a workspace sees
each other's changes appear on the board instantly, with presence
avatars showing who's online. Every setup step below happens in a web
page. No terminal, no CLI, no SQL.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com, sign in with a Google
   account, click **Add project**. Name it anything, disable Google
   Analytics if it asks (not needed), create.
2. In the left sidebar: **Build → Firestore Database → Create database**.
   Choose a location close to you, start in **production mode** (the
   rules you paste in step 3 replace the default-deny anyway).
3. In the left sidebar: **Build → Authentication → Get started → Sign-in
   method → Anonymous → Enable → Save**. This is the entire "auth setup"
   — one toggle, gives every browser a real identity with no sign-up
   flow. See "Identity model" below for what this does and doesn't mean.

## 2. Paste the security rules

1. Still in Firestore: **Rules** tab.
2. Open `firestore.rules` from this project, select all, copy.
3. Paste over everything in the Rules editor, click **Publish**.

## 3. Get your config values

1. Click the gear icon (top left) → **Project settings**.
2. Scroll to "Your apps" → click the `</>` (web) icon → give it any
   nickname → **Register app**. (Skip the "Firebase Hosting" checkbox,
   not needed for this.)
3. It shows a code snippet with a `firebaseConfig` object — six values:
   `apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`.

## 4. Configure the app

```bash
cp .env.example .env.local
```

Paste the six values in, matching names:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

```bash
npm install
npm run dev
```

With those set, the app shows a workspace screen instead of going
straight to the board. Without them, it behaves exactly as before —
local-only.

## No computer? Do this entirely from a phone browser

Firebase's console (steps 1–3 above) already works fine from a phone
browser. The only other thing you need is somewhere to actually run the
app's code, which also doesn't require installing anything:

1. **Get the code onto GitHub** (github.com, free, works on mobile): create
   a new repository, then use its web "Add file → Upload files" to upload
   this project's contents (unzip it in your phone's Files app first, then
   select everything at once). Commit.
2. **Open it in StackBlitz**: go to `stackblitz.com/github/YOUR-USERNAME/YOUR-REPO`
   in your phone's browser. It installs dependencies and runs the dev
   server *in the browser* — no local Node.js needed at all.
3. In StackBlitz, create a `.env.local` file (left file panel → new file)
   with the six `VITE_FIREBASE_*` values from step 3 above.
4. StackBlitz shows a live preview with a shareable URL — that's your
   running app.

This is fiddlier on a touchscreen than on a laptop (multi-file upload,
typing env values), but it's genuinely zero-install, zero-terminal.

## Identity model (read this)

There's no email/password/account system. **Anonymous Auth** (enabled in
step 1) gives every browser a real, persistent Firebase `auth.uid`
automatically, with no sign-up screen. A workspace is protected by its
invite code — joining means writing your own row into that workspace's
`members` subcollection, which `firestore.rules` only lets you do for
your own uid. Once you're a member, the rules let you read/write that
workspace's job data.

Two honest caveats, spelled out in comments at the top of
`firestore.rules`:
- Workspace **names and invite codes** (not job/company/recruiter data)
  are technically listable by anyone signed in anonymously — Firestore
  can't cleanly restrict "query by a specific invite code" beyond that
  without Cloud Functions. Actual board data stays membership-gated
  either way.
- This is real, verified identity (unlike a plain localStorage id), but
  it's still not an account — clearing browser data or switching devices
  gives you a new uid, and there's no "log back in" to recover access to
  a workspace except rejoining with the invite code.

## How it works

- **Local-first, sync-second.** Every write still lands in IndexedDB
  immediately (same optimistic-update/rollback pattern the app has
  always used) — sync is a layer on top, not a replacement for it.
- **Firestore's own offline persistence** (`enableIndexedDbPersistence`
  in `src/lib/firebase.ts`) queues writes made offline and retries them
  automatically on reconnect — no hand-rolled outbox table needed for
  this backend, unlike earlier Supabase/Convex versions of this sync
  engine.
- **Real-time listeners** (`onSnapshot`) push row-level added/modified
  events to every subscribed client the moment Firestore's servers see a
  change — this is what makes updates feel instant across devices.
- **Soft deletes.** Deleting a job sets `deletedAt` instead of removing
  the document, so it still shows up as a change for collaborators to
  tombstone, and the existing "Undo" toast has something to restore.
- **Conflict handling.** Last-write-wins, compared on `updatedAt`. Fine
  for a Kanban board's single-owner fields (status, notes, priority);
  not built for two people typing in the same field at the same moment.
- **Presence.** Firestore has no built-in presence primitive, so this
  uses the standard heartbeat pattern: each client writes to its own
  membership doc every 8s, and anyone whose `lastSeen` is within the
  last 15s counts as online.

## What this doesn't do (yet)

- No field-level merge for simultaneous edits to the same job — last
  write wins.
- No granular permissions — every workspace member can edit everything.
  The `role` field (`owner`/`member`) exists but nothing currently
  restricts based on it.
- **Not verified end-to-end in the environment that built this.** That
  sandbox has no network access to Firebase's servers, so none of this
  could be tested against a real project. Everything follows Firebase's
  documented SDK/rules patterns and typechecks, but your first run
  through steps 1–4 is the real test — if something errors, it's very
  fixable, just hasn't been seen firsthand yet.
