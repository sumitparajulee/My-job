// Thin wrapper around the Zoho Mail REST API - mirrors the shape of
// googleDrive.ts / googleSheets.ts (plain fetch calls, token passed in).
//
// Honest caveat, not papered over: Zoho's own docs describe these
// endpoints as being called from "a custom-maintained server," and in
// practice mail.zoho.com does not reliably send back
// Access-Control-Allow-Origin headers for arbitrary browser origins.
// Reading/sending mail (the calls below) may work fine from
// localhost/your Vercel domain, or may fail with an opaque CORS error
// depending on Zoho's current behavior for your account - that's outside
// Docket's control from a pure client-side app. If you hit that, the
// options are (a) it's still worth trying, since Zoho has loosened this
// in some accounts/DCs, or (b) route these specific calls through a
// small proxy (a Cloudflare Worker that just re-adds CORS headers works
// fine, same pattern noted for a "real" background Drive backup in
// GOOGLE_SETUP.md). The compose deep-link (zohoCompose in this file)
// doesn't touch the API at all, so it always works regardless of CORS.

import { zohoMailApiDomain } from './zohoAuth';

interface ZohoAccount {
  accountId: string;
  primaryEmailAddress: string;
}

interface ZohoApiEnvelope<T> {
  status: { code: number; description: string };
  data: T;
}

async function zohoFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${zohoMailApiDomain}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zoho Mail API error (${res.status}): ${body || res.statusText}`);
  }
  const json = (await res.json()) as ZohoApiEnvelope<T>;
  return json.data;
}

// First call after connecting - every other endpoint needs this
// accountId. Docket caches it in the store so it's only fetched once per
// session.
export async function getZohoAccount(token: string): Promise<ZohoAccount> {
  const accounts = await zohoFetch<Array<{ accountId: string; primaryEmailAddress: string }>>(
    token,
    '/api/accounts',
  );
  const primary = accounts[0];
  if (!primary) throw new Error('No Zoho Mail account found for this login.');
  return { accountId: primary.accountId, primaryEmailAddress: primary.primaryEmailAddress };
}

export interface SendZohoMailInput {
  accountId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  content: string; // HTML body
}

export async function sendZohoMail(token: string, input: SendZohoMailInput): Promise<void> {
  await zohoFetch(token, `/api/accounts/${input.accountId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      content: input.content,
    }),
  });
}

export interface ZohoMessageSummary {
  messageId: string;
  subject: string;
  sender: string;
  receivedTime: string;
  summary?: string;
}

// Used for the "did this recruiter reply?" check - searches the account
// for recent mail from a given address. Zoho's search syntax accepts a
// "from:" key; if Zoho changes this on their end, this is the one spot
// to fix it.
export async function searchZohoMailFromSender(
  token: string,
  accountId: string,
  senderEmail: string,
): Promise<ZohoMessageSummary[]> {
  const params = new URLSearchParams({ searchKey: `from:${senderEmail}`, limit: '5' });
  const results = await zohoFetch<
    Array<{ messageId: string; subject: string; sender: string; receivedTime: string; summary?: string }>
  >(token, `/api/accounts/${accountId}/messages/search?${params.toString()}`);
  return results.map((m) => ({
    messageId: m.messageId,
    subject: m.subject,
    sender: m.sender,
    receivedTime: m.receivedTime,
    summary: m.summary,
  }));
}

// No auth, no API call, no CORS risk - just opens Zoho's own webmail
// compose screen in a new tab with the recipient and subject filled in
// via a mailto: link. This is the one action from the earlier plan that
// works with zero setup (no VITE_ZOHO_CLIENT_ID required), because it's
// a mailto handoff rather than an API call:
// - If you've set Zoho Mail as your browser's default mailto handler
//   (Zoho Mail -> Settings -> System -> Mail To Handlers), this opens
//   Zoho's own compose window pre-filled.
// - Otherwise it opens whatever your browser's default mail app is.
// Zoho doesn't publish a documented external compose URL with query
// params for prefilling recipient/subject on the standalone webmail
// (mail.zoho.com/zm/#compose opens compose but ignores query params),
// so mailto: is the reliable choice here rather than guessing at an
// undocumented URL shape.
export function zohoComposeMailto(to: string, subject?: string): string {
  const params = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${to}${params}`;
}
