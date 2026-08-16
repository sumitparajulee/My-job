# Docket v2

A full personal job-application tracker: Kanban board, Companies/Recruiters
CRM, Calendar, Analytics, Document vault, a weekly Digest, and optional
real-time multi-user sync — installable as a PWA on mobile.

## Run it

```
npm install
npm run dev
```

## What's actually working

**Core**
- Create / edit / delete job applications (company, position, salary,
  location, dates, priority, tags, notes, URL, required software)
- Companies and Recruiters are normalized, deduped entities — a job never
  stores a company/recruiter name directly, only an id
- Drag-and-drop Kanban board, order persisted; on mobile, one status column
  at a time with a pill tab bar and prev/next quick-move buttons per card
- Saved/custom filter views on the board (search, priority, tag, software,
  "gone quiet"), persisted and reapplied from a Views dropdown
- Bulk actions: multi-select mode with a floating toolbar (move / archive /
  delete)
- Everything survives a refresh — IndexedDB is the source of truth, with
  optimistic updates and rollback if a local write fails
- Command palette (`⌘K` / `Ctrl+K`), quick add (`Senior Designer at Figma`
  + Enter), toasts with real Undo, light/dark mode
- Quick-capture bookmarklet — scrapes job title/company/location off
  LinkedIn/Seek/Indeed listing pages into a prefilled new-job modal

**Pages**
- **Companies / Recruiters** — full CRM views, recruiter follow-up urgency
  tracking with Zoho Mail integration
- **Calendar** — month view of deadlines and interviews
- **Analytics** — funnel charts, PDF report export, CSV export (all fields,
  client-side, no server round-trip)
- **Documents** — resume/cover letter vault; link a document to a job from
  the job form, see a "used in N" badge per document, dangling-reference
  cleanup on delete. Local-only (IndexedDB) by design — see "Known
  limitations" below
- **Digest** — weekly rollup of applications, overdue follow-ups, and
  upcoming deadlines, plus Gmail inbox-scanning that matches recent emails
  to active jobs and suggests status updates (interview/offer/rejection) to
  confirm or dismiss
- **Settings** — optional PBKDF2-hashed lock screen (UI lock, not
  data-at-rest encryption — stated plainly in the Settings UI)

**Sync & mobile**
- Real-time multi-user sync (Firebase/Firestore, fully opt-in — with no
  `VITE_FIREBASE_*` values configured the app runs local-only): live
  presence avatars, Live/Offline indicator, workspace join via invite code,
  no email/password step. See `FIREBASE_SETUP.md`
- PWA installable — manifest, icons, service worker (network-first
  navigations, cache-first assets)
- Home-screen app badge (and an in-app red-dot fallback) showing count of
  things due today: deadlines/interviews today or overdue, overdue
  recruiter follow-ups
- Bottom tab bar on mobile (Board/Home/Calendar/Digest + More), full-screen
  job form modal on small screens

## Known limitations

- **Documents aren't cloud-synced.** They're stored as base64 in IndexedDB,
  browser-local. Syncing them through the same Firestore engine as jobs
  would routinely exceed Firestore's 1MiB-per-document limit on real resume
  PDFs — doing this properly means routing files through Firebase Storage
  instead, which hasn't been built yet.
- The Settings lock screen only gates the UI; the underlying IndexedDB data
  is still readable from devtools with local device access.

## Architecture notes

- `src/types/models.ts` — the single normalized data model everything
  else refers to by id
- `src/db/database.ts` — Dexie/IndexedDB schema (source of truth on disk)
- `src/store/useDocketStore.ts` — Zustand store; every mutation writes
  through to IndexedDB and rolls back in-memory state if that write fails
- `src/store/useDocumentStore.ts` — documents (resume/cover letter) store,
  local-only, separate from the synced tables above
- `src/components/Kanban/` — board, column, and card, built on `@dnd-kit`
- `src/components/JobForm/` — create/edit modal, `react-hook-form` + `zod`
- `src/lib/firebase.ts` / `src/lib/syncEngine.ts` — Firebase client and
  the push/subscribe sync engine (no-ops if unconfigured)
- `src/lib/identity.ts` — Firebase Anonymous Auth wrapper, the identity
  system (see `FIREBASE_SETUP.md` for the trade-off)
- `src/store/useSessionStore.ts` — workspace create/join state
- `src/store/useSyncStore.ts` — live connection status + presence
- `src/components/Common/{AuthGate,SyncProvider,PresenceBar}.tsx` —
  workspace picker UI, the effect that wires session state to the docket
  store, and the top-bar presence indicator
- `firestore.rules` — security rules; paste into the Firebase console,
  no CLI deploy step (see `FIREBASE_SETUP.md`)
