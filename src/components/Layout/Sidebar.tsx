import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Kanban,
  Building2,
  Users,
  CalendarDays,
  FolderOpen,
  BarChart3,
  Settings,
  Sparkles,
  FileText,
  X,
  Mail,
  Globe,
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDocketStore } from '@/store/useDocketStore';
import { getAttentionCount } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Board', icon: Kanban, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/recruiters', label: 'Recruiters', icon: Users },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/digest', label: 'Weekly Digest', icon: Sparkles },
  { to: '/mail', label: 'Mail', icon: Mail },
  { to: '/web-tabs', label: 'Web Tabs', icon: Globe },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const jobs = useDocketStore((s) => s.jobs);
  const recruiters = useDocketStore((s) => s.recruiters);
  const attentionCount = getAttentionCount(jobs, recruiters);

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-ink/10 bg-paper-dim/95 backdrop-blur-sm transition-transform duration-200 dark:border-white/10 dark:bg-night-panel/95 md:static md:z-auto md:translate-x-0 md:bg-paper-dim/60 md:backdrop-blur-none md:dark:bg-night-panel ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-auto" />
            <span className="font-display text-lg font-semibold tracking-tight">Sumit's Job</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brass text-white shadow-stamp'
                    : 'text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5'
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
              {to === '/dashboard' && attentionCount > 0 && (
                <span className="ml-auto flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-brick px-1 font-mono text-[10px] font-semibold text-white">
                  {attentionCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink/10 px-4 py-3 font-mono text-[11px] text-ink-faint dark:border-white/10">
          v2.0 · Phase 1 build
        </div>
      </aside>
    </>
  );
}
