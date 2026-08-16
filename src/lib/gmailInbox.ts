// Real inbox reading for the Mail page — separate from gmailScan.ts,
// which only pulls header metadata for the job-signal heuristics.
// This fetches full message bodies (format=full) so a person can
// actually read mail inside Docket, not just see that something
// matched a keyword.
//
// Same auth as everywhere else Gmail is used: a bearer token from
// googleAuth.ts carrying the `https://mail.google.com/` scope.

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface InboxMessage {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string; // ISO
  unread: boolean;
}

export interface MessageAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export interface MessageBody {
  html: string | null;
  text: string | null;
  attachments: MessageAttachment[];
  // Everything a reply needs to thread correctly in Gmail, plus the
  // original recipient list for "Reply all".
  messageIdHeader: string | null;
  references: string | null;
  toHeader: string;
  ccHeader: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseFromHeader(raw: string): { name: string; email: string } {
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  const name = match ? raw.slice(0, match.index).trim().replace(/^"|"$/g, '') : email;
  return { name: name || email, email };
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// Gmail messages are a tree of parts (multipart/alternative,
// multipart/mixed, multipart/related, nested forwards, etc). Walk it
// depth-first collecting the first text/html and text/plain bodies
// found, plus anything that looks like a real attachment (has a
// filename and either an attachmentId or inline data).
function walkParts(
  part: GmailMessagePart,
  acc: { html: string | null; text: string | null; attachments: MessageAttachment[] },
): void {
  const mimeType = part.mimeType ?? '';

  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({
      filename: part.filename,
      mimeType,
      attachmentId: part.body.attachmentId,
      size: part.body.size ?? 0,
    });
  } else if (mimeType === 'text/html' && !acc.html && part.body?.data) {
    acc.html = decodeBase64Url(part.body.data);
  } else if (mimeType === 'text/plain' && !acc.text && part.body?.data) {
    acc.text = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) walkParts(child, acc);
}

// Lists recent inbox messages with header metadata (From/Subject/Date)
// plus Gmail's own snippet and unread state. Paginated via Gmail's
// pageToken — the list endpoint alone doesn't include headers, so this
// still does one metadata GET per message, same pattern as
// gmailScan.ts, just exposed with paging instead of a single capped
// batch.
export async function listInboxMessages(
  token: string,
  opts: { pageToken?: string; query?: string; maxResults?: number } = {},
): Promise<{ messages: InboxMessage[]; nextPageToken: string | null }> {
  const { pageToken, query, maxResults = 20 } = opts;
  const q = encodeURIComponent(query ? `in:inbox ${query}` : 'in:inbox');
  const params = new URLSearchParams({ maxResults: String(maxResults), q: decodeURIComponent(q) });
  if (pageToken) params.set('pageToken', pageToken);

  const listRes = await fetch(`${GMAIL_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Could not list Gmail messages (${listRes.status})`);
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
  };
  const refs = listData.messages ?? [];

  const messages: InboxMessage[] = [];
  for (const ref of refs) {
    const res = await fetch(
      `${GMAIL_BASE}/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) continue; // one bad message shouldn't sink the whole page
    const data = (await res.json()) as {
      id: string;
      threadId: string;
      snippet?: string;
      internalDate?: string;
      labelIds?: string[];
      payload?: { headers?: GmailHeader[] };
    };
    const headers = data.payload?.headers;
    const { name, email } = parseFromHeader(headerValue(headers, 'From'));
    messages.push({
      id: data.id,
      threadId: data.threadId,
      fromName: name,
      fromEmail: email,
      subject: headerValue(headers, 'Subject') || '(no subject)',
      snippet: data.snippet ?? '',
      date: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : new Date().toISOString(),
      unread: Boolean(data.labelIds?.includes('UNREAD')),
    });
  }

  return { messages, nextPageToken: listData.nextPageToken ?? null };
}

// Fetches the full body of one message and pulls out the best
// html/text content plus attachment metadata (name/size/id — the
// binary content itself is a separate call, only made if the person
// actually downloads one).
export async function getMessageBody(token: string, messageId: string): Promise<MessageBody> {
  const res = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not load message (${res.status})`);
  const data = (await res.json()) as { payload?: GmailMessagePart };

  const acc: { html: string | null; text: string | null; attachments: MessageAttachment[] } = {
    html: null,
    text: null,
    attachments: [],
  };
  if (data.payload) walkParts(data.payload, acc);

  const topHeaders = data.payload?.headers;
  return {
    ...acc,
    messageIdHeader: headerValue(topHeaders, 'Message-Id') || null,
    references: headerValue(topHeaders, 'References') || null,
    toHeader: headerValue(topHeaders, 'To'),
    ccHeader: headerValue(topHeaders, 'Cc'),
  };
}

// Downloads one attachment's raw bytes as a Blob, for a "Download"
// click on a specific attachment — not called during normal list/read.
export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  mimeType: string,
): Promise<Blob> {
  const res = await fetch(`${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not download attachment (${res.status})`);
  const data = (await res.json()) as { data?: string };
  if (!data.data) throw new Error('Attachment had no data');
  const normalized = data.data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

// Best-effort: removes the UNREAD label so the message matches what
// opening it in Gmail itself would do. Failure here shouldn't block
// reading the message — the caller already has the body either way.
export async function markAsRead(token: string, messageId: string): Promise<void> {
  await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  }).catch(() => {});
}
