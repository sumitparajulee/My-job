import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Kanban, CalendarDays, Sparkles, Menu } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDocketStore } from '@/store/useDocketStore';
import { getAttentionCount } from '@/lib/utils';
import { cn } from '@/lib/utils';

// A thumb-reachable bottom bar for the four pages used most while
// actively job-hunting, plus a "More" button that opens the existing
// sidebar drawer for everything else (Companies, Recruiters, Documents,
// Analytics, Settings) — mirrors the common mobile pattern of a handful
// of primary destinations plus an overflow menu, instead of cramming all
// nine sidebar items into a bar that's only ~380px wide.
const TABS = [
  { to: '/', label: 'Board', icon: Kanban, end: true },
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/digest', label: 'Digest', icon: Sparkles },
];

export function BottomNav() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const jobs = useDocketStore((s) => s.jobs);
  const recruiters = useDocketStore((s) => s.recruiters);
  const attentionCount = getAttentionCount(jobs, recruiters);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-ink/10 bg-paper-dim/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm dark:border-white/10 dark:bg-night-panel/95 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium',
              isActive ? 'text-brass' : 'text-ink-faint dark:text-paper/50',
            )
          }
        >
          <span className="relative">
            <Icon className="h-5 w-5" strokeWidth={2} />
            {to === '/dashboard' && attentionCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-brick px-0.5 text-[8px] font-bold text-white">
                {attentionCount > 9 ? '9+' : attentionCount}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
      <button
        onClick={() => setSidebarOpen(true)}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-ink-faint dark:text-paper/50"
      >
        <Menu className="h-5 w-5" strokeWidth={2} />
        More
      </button>
    </nav>
  );
}
