// Thin wrapper around the Gmail REST API - same plain-fetch-with-bearer-
// token pattern as googleDrive.ts / googleSheets.ts. Uses the
// `gmail.send` scope Docket already requests during Google connect (see
// googleAuth.ts), so no separate consent step is needed beyond the
// existing "Connect Google account" flow in Settings.
//
// Unlike Zoho Mail, the Gmail API reliably sends CORS headers for
// browser-based calls with an Authorization: Bearer token, so this
// works directly from the client with no proxy.

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function toBase64Url(input: string): string {
  const utf8Bytes = new TextEncoder().encode(input);
  let binary = '';
  utf8Bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeSubject(subject: string): string {
  const utf8Bytes = new TextEncoder().encode(subject);
  let binary = '';
  utf8Bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

// Chunks a base64 attachment body onto 76-char lines, which is what
// RFC 2045 expects and what every mail client assumes when parsing
// base64-encoded MIME parts — a single unbroken line is technically
// invalid and some servers/clients choke on it.
function chunkBase64(base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) lines.push(base64.slice(i, i + 76));
  return lines.join('\r\n');
}

export interface SendGmailAttachment {
  filename: string;
  mimeType: string;
  base64Data: string; // raw base64 (standard alphabet), no data: prefix
}

export interface SendGmailInput {
  toAddress: string;
  ccAddress?: string;
  bccAddress?: string;
  subject: string;
  content: string; // HTML body
  // Threading — set all three when replying so the message lands in
  // the same Gmail conversation instead of starting a new one.
  threadId?: string;
  inReplyTo?: string; // the original message's Message-Id header, e.g. "<abc@mail.gmail.com>"
  references?: string; // space-separated chain of Message-Ids being replied to
  attachments?: SendGmailAttachment[];
}

export async function sendGmail(token: string, input: SendGmailInput): Promise<void> {
  const headers = [
    `To: ${input.toAddress}`,
    input.ccAddress ? `Cc: ${input.ccAddress}` : null,
    input.bccAddress ? `Bcc: ${input.bccAddress}` : null,
    `Subject: ${encodeSubject(input.subject)}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references ? `References: ${input.references}` : null,
    'MIME-Version: 1.0',
  ].filter((line): line is string => line !== null);

  let mime: string;

  if (input.attachments && input.attachments.length > 0) {
    const boundary = `docket_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const parts = [
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      input.content,
      '',
      ...input.attachments.flatMap((att) => [
        `--${boundary}`,
        `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        chunkBase64(att.base64Data),
        '',
      ]),
      `--${boundary}--`,
    ];
    mime = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', parts.join('\r\n')].join(
      '\r\n',
    );
  } else {
    mime = [...headers, 'Content-Type: text/html; charset=UTF-8', '', input.content].join('\r\n');
  }

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: toBase64Url(mime),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gmail send failed (${res.status}): ${body || res.statusText}`);
  }
}
