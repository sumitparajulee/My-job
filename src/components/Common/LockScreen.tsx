import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Stamp } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

export function LockScreen() {
  const unlock = useAuthStore((s) => s.unlock);
  const error = useAuthStore((s) => s.error);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    await unlock(password);
    setChecking(false);
    setPassword('');
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-brass-soft via-brass to-brass-dim p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl dark:bg-night-panel"
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brass/10">
            <Stamp className="h-5 w-5 text-brass" />
          </div>
          <h1 className="font-display text-lg font-semibold">Sumit's Job is locked</h1>
          <p className="text-xs text-ink-faint">Enter your password to continue</p>
        </div>

        <label className="block">
          <span className="sr-only">Password</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              autoFocus
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-9 pr-9"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink dark:hover:text-paper"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </label>

        {error && <p className="mt-2 text-xs text-brick">{error}</p>}

        <button
          type="submit"
          disabled={checking || password.length === 0}
          className="mt-4 w-full rounded-full bg-brass px-4 py-2.5 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.01] disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
