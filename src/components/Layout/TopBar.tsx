import { useRef } from 'react';
import { Lock, Menu, Moon, Search, Sun } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { PresenceBar } from '@/components/Common/PresenceBar';
import { NotificationBell } from '@/components/Common/NotificationBell';

export function TopBar() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const hasPassword = useAuthStore((s) => s.hasPassword);
  const lock = useAuthStore((s) => s.lock);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  const themeButtonRef = useRef<HTMLButtonElement>(null);

  function handleToggleTheme() {
    const button = themeButtonRef.current;
    const supportsViewTransitions = typeof document.startViewTransition === 'function';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!button || !supportsViewTransitions || prefersReducedMotion) {
      toggleTheme();
      return;
    }

    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      toggleTheme();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
        },
        {
          duration: 550,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink/10 px-3 dark:border-white/10 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
        <span className="hidden font-mono text-xs text-ink-faint sm:inline">{today}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <PresenceBar />
        <NotificationBell />
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-ink/10 px-2.5 py-1.5 text-xs text-ink-faint transition-colors hover:bg-ink/5 dark:border-white/10 dark:hover:bg-white/5 sm:px-3"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Quick find</span>
          <kbd className="hidden rounded border border-ink/15 bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] dark:border-white/15 dark:bg-white/10 sm:inline">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
        <button
          ref={themeButtonRef}
          onClick={handleToggleTheme}
          aria-label="Toggle dark mode"
          className="rounded-md p-2 text-ink-soft transition-colors hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {hasPassword && (
          <button
            onClick={lock}
            aria-label="Lock Sumit's Job"
            title="Lock now"
            className="rounded-md p-2 text-ink-soft transition-colors hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
          >
            <Lock className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}
