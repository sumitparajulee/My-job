import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, LayoutDashboard, Moon, Plus, Search, Sun } from 'lucide-react';
import { useDocketStore } from '@/store/useDocketStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useUIStore } from '@/store/useUIStore';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Plus;
  run: (e?: React.MouseEvent) => void;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openJobModal = useUIStore((s) => s.openJobModal);
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Cmd/Ctrl+K shortcut, works from anywhere in the app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function handleToggleTheme(e?: React.MouseEvent) {
    const supportsViewTransitions = typeof document.startViewTransition === 'function';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!e || !supportsViewTransitions || prefersReducedMotion) {
      toggleTheme();
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
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

  const staticCommands: Command[] = [
    { id: 'new-job', label: 'New application', icon: Plus, run: () => openJobModal('new') },
    { id: 'go-board', label: 'Go to Board', icon: Briefcase, run: () => navigate('/') },
    { id: 'go-dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, run: () => navigate('/dashboard') },
    {
      id: 'toggle-theme',
      label: 'Toggle light / dark mode',
      icon: useThemeStore.getState().theme === 'dark' ? Sun : Moon,
      run: handleToggleTheme,
    },
  ];

  const jobResults: Command[] = useMemo(() => {
    if (query.trim().length === 0) return [];
    const q = query.toLowerCase();
    return jobs
      .filter((j) => {
        const companyName = companies.find((c) => c.id === j.companyId)?.name ?? '';
        return `${j.position} ${companyName}`.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((j) => {
        const companyName = companies.find((c) => c.id === j.companyId)?.name ?? 'Unknown';
        return {
          id: j.id,
          label: `${j.position} — ${companyName}`,
          hint: 'Open',
          icon: Search,
          run: () => openJobModal(j),
        };
      });
  }, [query, jobs, companies]);

  const filteredStatic = staticCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );
  const results = [...jobResults, ...filteredStatic];

  useEffect(() => setHighlight(0), [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[highlight]?.run();
      setOpen(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-start justify-center bg-ink/40 pt-[15vh] backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-lg border border-ink/10 bg-white shadow-2xl dark:border-white/10 dark:bg-night-panel"
          >
            <div className="flex items-center gap-2.5 border-b border-ink/10 px-4 py-3 dark:border-white/10">
              <Search className="h-4 w-4 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search jobs or run a command…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
              <kbd className="rounded border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint dark:border-white/15">
                esc
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-ink-faint">No matches</p>
              )}
              {results.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={(e) => {
                    cmd.run(e);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    i === highlight
                      ? 'bg-brass/12 text-ink dark:text-paper'
                      : 'text-ink-soft dark:text-paper/70'
                  }`}
                >
                  <cmd.icon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="text-xs text-ink-faint">{cmd.hint}</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
