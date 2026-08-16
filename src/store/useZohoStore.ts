import { create } from 'zustand';
import { connectZoho, disconnectZoho, getCachedZohoToken, isZohoConfigured } from '@/lib/zohoAuth';
import { getZohoAccount, searchZohoMailFromSender, sendZohoMail } from '@/lib/zohoMail';
import { useToastStore } from './useToastStore';

const LS_WAS_CONNECTED = 'docket-zoho-was-connected';
const LS_ACCOUNT_ID = 'docket-zoho-account-id';
const LS_EMAIL = 'docket-zoho-email';

interface ZohoState {
  isConfigured: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  accountId: string | null;
  email: string | null;
  autoCheckReplies: boolean;
  lastError: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  setAutoCheckReplies: (enabled: boolean) => void;
  sendMail: (toAddress: string, subject: string, content: string) => Promise<void>;
  // Looks for recent mail from this address and surfaces a toast — kept
  // deliberately lightweight (no automatic Timeline entries) rather than
  // reaching into the docket store's CRUD for something this speculative.
  checkForReplyFrom: (senderEmail: string) => Promise<void>;
}

export const useZohoStore = create<ZohoState>((set, get) => ({
  isConfigured: isZohoConfigured,
  isConnected: false,
  isConnecting: false,
  accountId: localStorage.getItem(LS_ACCOUNT_ID),
  email: localStorage.getItem(LS_EMAIL),
  autoCheckReplies: localStorage.getItem('docket-zoho-auto-check') === 'true',
  lastError: null,

  // Interactive only — Zoho's implicit-grant popup has to run from a
  // click handler, and there's no silent reconnect path (see
  // zohoAuth.ts). So unlike Google sync, this doesn't try to
  // auto-reconnect on app start; Settings just shows "Connect" again
  // each new session, which the button copy makes clear.
  connect: async () => {
    set({ isConnecting: true, lastError: null });
    try {
      const token = await connectZoho();
      const account = await getZohoAccount(token);
      localStorage.setItem(LS_WAS_CONNECTED, 'true');
      localStorage.setItem(LS_ACCOUNT_ID, account.accountId);
      localStorage.setItem(LS_EMAIL, account.primaryEmailAddress);
      set({
        isConnected: true,
        isConnecting: false,
        accountId: account.accountId,
        email: account.primaryEmailAddress,
      });
    } catch (err) {
      set({
        isConnecting: false,
        lastError: err instanceof Error ? err.message : 'Could not connect to Zoho Mail',
      });
      throw err;
    }
  },

  disconnect: () => {
    disconnectZoho();
    localStorage.setItem(LS_WAS_CONNECTED, 'false');
    set({ isConnected: false });
  },

  setAutoCheckReplies: (enabled) => {
    localStorage.setItem('docket-zoho-auto-check', String(enabled));
    set({ autoCheckReplies: enabled });
  },

  sendMail: async (toAddress, subject, content) => {
    const { accountId, email } = get();
    const token = getCachedZohoToken();
    if (!token || !accountId || !email) {
      set({ isConnected: false, lastError: 'Zoho session expired — reconnect and try again.' });
      throw new Error('Not connected to Zoho Mail');
    }
    try {
      await sendZohoMail(token, { accountId, fromAddress: email, toAddress, subject, content });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Send failed' });
      throw err;
    }
  },

  checkForReplyFrom: async (senderEmail) => {
    const { accountId } = get();
    const token = getCachedZohoToken();
    if (!token || !accountId) {
      set({ isConnected: false, lastError: 'Zoho session expired — reconnect and try again.' });
      return;
    }
    try {
      const messages = await searchZohoMailFromSender(token, accountId, senderEmail);
      if (messages.length === 0) {
        useToastStore.getState().push({ message: `No recent mail from ${senderEmail}`, tone: 'default' });
        return;
      }
      const latest = messages[0];
      useToastStore.getState().push({
        message: `${messages.length} email${messages.length > 1 ? 's' : ''} from ${senderEmail} — latest: "${latest.subject}"`,
        tone: 'success',
        duration: 8000,
      });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Reply check failed' });
    }
  },
}));
