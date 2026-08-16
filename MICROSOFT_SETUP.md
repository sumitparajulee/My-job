# Microsoft sync setup

This enables two things in Settings → Microsoft sync:

- **Daily OneDrive backup** — the same JSON snapshot as the manual "Export
  backup" button and the Google Drive backup, uploaded to a file called
  `docket-backup.json` in a dedicated app folder, refreshed roughly once
  a day while the app is open.
- **Live Excel sync** — every job (all statuses), kept up to date in a
  workbook called "Docket — Job Applications.xlsx", a few seconds after
  any change.

Nothing here needs a backend or a paid Azure tier — it's a free OAuth
app registration, same shape as the Google setup you already did.

## 1. Create an Azure AD app registration

1. Go to [entra.microsoft.com](https://entra.microsoft.com/) (or
   [portal.azure.com](https://portal.azure.com/) → search "App
   registrations").
2. **App registrations** → **New registration**.
3. Name it `Docket`.
4. **Supported account types**: choose **Accounts in any organizational
   directory and personal Microsoft accounts** — this is what lets both
   work/school accounts and personal outlook.com/live.com accounts (the
   ones OneDrive personal actually lives on) sign in.
5. **Redirect URI**: platform **Single-page application (SPA)**, value
   `http://localhost:5173` for local dev. **Register**.
6. On the app's **Overview** page, copy the **Application (client) ID**
   — looks like `12345678-abcd-1234-abcd-1234567890ab`.

## 2. Add your production redirect URI

1. Left sidebar → **Authentication**.
2. Under the **Single-page application** platform, **Add URI** — your
   production URL (the Vercel domain that's currently deploying, e.g.
   `https://docket-xyz.vercel.app`, and/or your custom domain if you
   attach one).
3. Save.

No API permissions need to be added by hand — `Files.ReadWrite.AppFolder`
and `User.Read` are both delegated Microsoft Graph permissions that
don't require admin consent for personal accounts, so Docket requests
them directly at connect time and Microsoft's own consent screen
handles the rest.

## 3. Add the client ID to Docket

Local dev — in `.env` (create it from `.env.example` if you haven't):

```
VITE_MICROSOFT_CLIENT_ID=your-client-id-here
```

Vercel — Project → Settings → Environment Variables → add
`VITE_MICROSOFT_CLIENT_ID` with the same value → redeploy (env var
changes need a fresh build to take effect).

## 4. Connect

Settings → Microsoft sync → **Connect Microsoft account** → pick your
account → allow. Docket creates the tracking workbook automatically on
first connect and remembers its id, so reconnecting later never
creates a second one.

## What Docket can and can't see

The scopes requested are:

- `Files.ReadWrite.AppFolder` — Docket can only read/write inside a
  single dedicated "Apps/Docket" folder Microsoft creates automatically
  for this app. It cannot browse, read, or touch anything else already
  in your OneDrive.
- `User.Read` — basic profile read (name/email), used only to confirm
  which account is connected.

Unlike the Google side, this app folder is private per account — there's
no equivalent to pointing multiple collaborators at one shared sheet
via a pasted link, since `Files.ReadWrite.AppFolder` doesn't grant
cross-account access. Each Microsoft account that connects gets (or
creates) its own private workbook.

## The "daily" and "live" limits worth knowing

Same caveat as the Google side: Docket is fully client-side, and MSAL's
tokens for browser apps don't come with a long-lived refresh token by
design. Practical effect:

- OneDrive backup and Excel sync only run while the app is **open in a
  browser tab**. There's no true OS-level background job running when
  your laptop is closed or the tab isn't open.
- Most of the time, reconnecting is silent and automatic (MSAL caches
  the session). Occasionally — if that Microsoft session lapses — a
  sync will quietly stop and Settings will show "not connected" again;
  clicking **Connect** once more fixes it.
