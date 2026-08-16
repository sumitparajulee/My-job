# Google sync setup

This enables two things in Settings → Google sync:

- **Daily Drive backup** — the same JSON snapshot as the manual "Export
  backup" button, uploaded to a file called `docket-backup.json` in your
  Drive, refreshed roughly once a day while the app is open.
- **Live Sheets sync** — every job (all statuses), kept up to date in a
  spreadsheet called "Docket — Job Applications", a few seconds after any
  change.

Nothing here needs a backend or a paid Google Cloud tier — it's a free
OAuth client, same shape as the Firebase setup you already did.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Top-left project dropdown → **New Project**. Name it something like
   `docket` → **Create**.
3. Make sure that new project is selected (top-left dropdown) before
   continuing.

## 2. Enable the two APIs Docket needs

1. Left sidebar → **APIs & Services** → **Library**.
2. Search **Google Drive API** → open it → **Enable**.
3. Back to the Library, search **Google Sheets API** → open it → **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → Create.
3. Fill in the required fields (app name `Docket`, your email for support
   and developer contact) → Save and continue through Scopes (skip, no
   need to add anything here) → **Test users**: add your own Google
   account email → Save and continue → back to dashboard.
4. Leave **Publishing status** as **Testing**. This means only the test
   user(s) you listed can sign in — which is exactly right for a
   single-person app. You'll see an "unverified app" warning the first
   time you connect; that's expected for a personal project and you can
   click through it (Advanced → Go to Docket (unsafe)). Google's
   verification review is only needed if you want *other people* to use
   this, which doesn't apply here.

## 4. Create the OAuth client ID

1. **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**.
2. Application type: **Web application**. Name it `Docket web`.
3. **Authorized JavaScript origins** — add every URL you actually open
   Docket from:
   - `http://localhost:5173` (local dev)
   - your production URL (the Vercel domain that's currently deploying,
     e.g. `https://docket-xyz.vercel.app`, and/or your custom domain if
     you attach one)
4. Leave **Authorized redirect URIs** empty — Docket uses Google's token
   flow, which doesn't redirect anywhere.
5. **Create**. Copy the **Client ID** shown (looks like
   `123456789-abc...apps.googleusercontent.com`).

## 5. Add the client ID to Docket

Local dev — in `.env` (create it from `.env.example` if you haven't):

```
VITE_GOOGLE_CLIENT_ID=your-client-id-here
```

Vercel — Project → Settings → Environment Variables → add
`VITE_GOOGLE_CLIENT_ID` with the same value → redeploy (env var changes
need a fresh build to take effect).

## 6. Connect

Settings → Google sync → **Connect Google account** → pick your account
→ click through the unverified-app warning → allow. Docket creates the
tracking spreadsheet automatically on first connect and remembers its ID,
so reconnecting later never creates a second one.

## What Docket can and can't see

The OAuth scopes requested are:

- `drive.file` — Docket can only read/write files it creates itself
  (the backup file). It cannot browse, read, or touch anything else
  already in your Drive.
- `spreadsheets` — read/write access to Sheets content, needed to write
  job rows into the tracking spreadsheet it created.

## The "daily" and "live" limits worth knowing

Docket is fully client-side — no server of its own. Google's OAuth
tokens for browser apps like this are short-lived (about an hour) and
don't come with a refresh token, by design, for security. Practical
effect:

- Drive backup and Sheets sync only run while the app is **open in a
  browser tab**. There's no true OS-level background job running when
  your laptop is closed or the tab isn't open.
- Most of the time, reconnecting is silent and automatic (Google
  remembers your session). Occasionally — if that Google session lapses
  — a sync will quietly stop and Settings will show "not connected"
  again; clicking **Connect** once more fixes it.

If you ever want backups that happen truly independent of the app being
open, that needs a small server holding a refresh token — doable later
with a Cloudflare Worker (same pattern as your Visitor Ledger project),
but out of scope for this client-only version.
