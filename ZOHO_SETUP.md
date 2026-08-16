# Zoho Mail setup

This enables Settings → Zoho Mail: sending mail as you, and a manual
"Check for reply" button on recruiter cards that looks for recent
inbox mail from that recruiter's address.

The **"Draft in Zoho Mail" button** on every recruiter card works with
**no setup at all** — it's a plain `mailto:` link, not an API call, so
skip everything below if that's all you want.

Nothing here needs a backend or a paid Zoho tier — same free-OAuth-client
shape as the Google setup.

## 1. Register an app in the Zoho API Console

1. Go to the [Zoho API Console](https://api-console.zoho.com/).
2. **Add Client** → **Client-based** (this is the type for browser-only
   apps — no client secret is ever used).
3. Client Name: `Docket`. Homepage URL: your Vercel URL (or
   `http://localhost:5173` for local dev — you can only list one at a
   time here, see step 3).
4. **Authorized Redirect URIs** — add every URL Docket runs from, each
   with `/zoho-callback` appended:
   - `http://localhost:5173/zoho-callback` (local dev)
   - `https://your-app.vercel.app/zoho-callback` (production)
5. **Create**. Copy the **Client ID** shown (looks like
   `1000.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`). There's no secret to copy —
   client-based apps don't get one, by design.

## 2. Add the client ID to Docket

Local dev — in `.env` (create it from `.env.example` if you haven't):
