import { useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';

const ALLOWED_EMAIL_ALT = 'hello@cmparajuli.com.np';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-brass-soft via-brass to-brass-dim p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-night-panel">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-brass/30">
            <img src="/avatar.jpg" alt="" className="h-full w-full object-cover" />
          </div>
          <h1 className="font-display text-lg font-semibold">Sumit's Job</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

// Two sign-in paths — Google and email/password — both locked to the
// same two-address allowlist (enforced in src/lib/identity.ts; any
// other account is signed straight back out with an error, never
// reaching a workspace). The access-code and GitHub paths that used to
// live here are removed: this deployment is single-user, and every
// extra entry point was another way for someone other than Sumit to end
// up in the shared workspace, plus a second identity that could drift
// out of sync with the "real" one. Two paths in, two identities, both
// pinned by email — no open door.
export function AuthGate() {
  const status = useSessionStore((s) => s.status);
  const signInWithGoogle = useSessionStore((s) => s.signInWithGoogle);
  const signInWithEmail = useSessionStore((s) => s.signInWithEmail);
  const error = useSessionStore((s) => s.error);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (status === 'ready' || status === 'local-only') {
    return null;
  }

  if (status === 'connecting') {
    return (
      <Shell>
        <p className="text-center text-sm text-ink-faint">Connecting…</p>
      </Shell>
    );
  }

  async function handleGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    await signInWithGoogle();
    setGoogleBusy(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailBusy) return;
    setEmailBusy(true);
    await signInWithEmail(email, password);
    setEmailBusy(false);
  }

  return (
    <Shell>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleBusy}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50 dark:border-white/15 dark:bg-night-panel dark:text-paper"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.74l4-3.1Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
          />
        </svg>
        {googleBusy ? 'Connecting…' : 'Continue with Google'}
      </button>

      <div className="my-3 flex items-center gap-2">
        <div className="h-px flex-1 bg-ink/10 dark:bg-white/10" />
        <span className="text-[11px] uppercase tracking-wide text-ink-faint">or</span>
        <div className="h-px flex-1 bg-ink/10 dark:bg-white/10" />
      </div>

      {!showEmailForm ? (
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          className="w-full rounded-md border border-ink/15 bg-transparent px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-transform hover:scale-[1.02] dark:border-white/15 dark:text-paper"
        >
          Continue with email
        </button>
      ) : (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder={ALLOWED_EMAIL_ALT}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brass dark:border-white/15 dark:bg-night-panel dark:text-paper"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brass dark:border-white/15 dark:bg-night-panel dark:text-paper"
          />
          <button
            type="submit"
            disabled={emailBusy}
            className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50 dark:bg-brass dark:text-ink"
          >
            {emailBusy ? 'Connecting…' : 'Sign in'}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-center text-xs text-brick">{error}</p>}
    </Shell>
  );
}
