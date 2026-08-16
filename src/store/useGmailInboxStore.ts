import { create } from 'zustand';
import { getSilentToken } from '@/lib/googleAuth';
import { sendGmail } from '@/lib/gmail';
import {
  downloadAttachment,
  getMessageBody,
  listInboxMessages,
  markAsRead,
  type InboxMessage,
  type MessageBody,
} from '@/lib/gmailInbox';

interface GmailInboxState {
  messages: InboxMessage[];
  nextPageToken: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;

  selectedId: string | null;
  selectedBody: MessageBody | null;
  bodyLoading: boolean;
  bodyError: string | null;

  loadInbox: () => Promise<void>;
  loadMore: () => Promise<void>;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  selectMessage: (id: string) => Promise<void>;
  clearSelection: () => void;
  saveAttachment: (attachmentId: string, filename: string, mimeType: string) => Promise<void>;

  sending: boolean;
  sendError: string | null;
  sendMessage: (input: {
    to: string;
    cc?: string;
    subject: string;
    bodyHtml: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: { filename: string; mimeType: string; base64Data: string }[];
  }) => Promise<boolean>;
  clearSendError: () => void;
}

async function requireToken(set: (partial: Partial<GmailInboxState>) => void): Promise<string | null> {
  const token = await getSilentToken();
  if (!token) {
    set({ error: 'Google session expired — reconnect Gmail in Settings and try again.' });
    return null;
  }
  return token;
}

export const useGmailInboxStore = create<GmailInboxState>((set, get) => ({
  messages: [],
  nextPageToken: null,
  loading: false,
  loadingMore: false,
  error: null,
  query: '',

  selectedId: null,
  selectedBody: null,
  bodyLoading: false,
  bodyError: null,

  loadInbox: async () => {
    set({ loading: true, error: null });
    const token = await requireToken(set);
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const { messages, nextPageToken } = await listInboxMessages(token, { query: get().query });
      set({ messages, nextPageToken, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Could not load inbox' });
    }
  },

  loadMore: async () => {
    const { nextPageToken, loadingMore, query, messages } = get();
    if (!nextPageToken || loadingMore) return;
    set({ loadingMore: true, error: null });
    const token = await requireToken(set);
    if (!token) {
      set({ loadingMore: false });
      return;
    }
    try {
      const { messages: more, nextPageToken: next } = await listInboxMessages(token, {
        query,
        pageToken: nextPageToken,
      });
      set({ messages: [...messages, ...more], nextPageToken: next, loadingMore: false });
    } catch (err) {
      set({ loadingMore: false, error: err instanceof Error ? err.message : 'Could not load more messages' });
    }
  },

  setQuery: (query) => set({ query }),

  search: async () => {
    await get().loadInbox();
  },

  selectMessage: async (id) => {
    set({ selectedId: id, selectedBody: null, bodyLoading: true, bodyError: null });
    const token = await requireToken(set);
    if (!token) {
      set({ bodyLoading: false });
      return;
    }
    try {
      const body = await getMessageBody(token, id);
      set({ selectedBody: body, bodyLoading: false });
      // Optimistically flip the unread flag in the list immediately —
      // don't wait on the modify call, and don't fail the read if it
      // errors (see markAsRead's own best-effort catch).
      set({ messages: get().messages.map((m) => (m.id === id ? { ...m, unread: false } : m)) });
      void markAsRead(token, id);
    } catch (err) {
      set({ bodyLoading: false, bodyError: err instanceof Error ? err.message : 'Could not load message' });
    }
  },

  clearSelection: () => set({ selectedId: null, selectedBody: null, bodyError: null }),

  saveAttachment: async (attachmentId, filename, mimeType) => {
    const { selectedId } = get();
    if (!selectedId) return;
    const token = await getSilentToken();
    if (!token) {
      set({ bodyError: 'Google session expired — reconnect Gmail in Settings and try again.' });
      return;
    }
    const blob = await downloadAttachment(token, selectedId, attachmentId, mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  sending: false,
  sendError: null,

  sendMessage: async ({ to, cc, subject, bodyHtml, threadId, inReplyTo, references, attachments }) => {
    set({ sending: true, sendError: null });
    const token = await getSilentToken();
    if (!token) {
      set({ sending: false, sendError: 'Google session expired — reconnect Gmail in Settings and try again.' });
      return false;
    }
    try {
      await sendGmail(token, {
        toAddress: to,
        ccAddress: cc || undefined,
        subject,
        content: bodyHtml,
        threadId,
        inReplyTo,
        references,
        attachments,
      });
      set({ sending: false });
      return true;
    } catch (err) {
      set({ sending: false, sendError: err instanceof Error ? err.message : 'Could not send message' });
      return false;
    }
  },

  clearSendError: () => set({ sendError: null }),
}));
