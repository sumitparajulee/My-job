import { useSyncStore } from '@/store/useSyncStore';
import { useSessionStore } from '@/store/useSessionStore';
import { cn } from '@/lib/utils';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function PresenceBar() {
  const enabled = useSyncStore((s) => s.enabled);
  const status = useSyncStore((s) => s.status);
  const presence = useSyncStore((s) => s.presence);
  const workspace = useSessionStore((s) => s.workspace);

  if (!enabled || !workspace) return null;

  const others = presence.filter((p) => p.userId !== useSessionStore.getState().member?.userId);

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {others.slice(0, 5).map((p) => (
          <div
            key={p.userId}
            title={p.displayName}
            style={{ backgroundColor: p.color }}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-night-panel"
          >
            {initials(p.displayName)}
          </div>
        ))}
      </div>
      <span
        title={status === 'live' ? 'Live sync connected' : status === 'connecting' ? 'Connecting…' : 'Offline — changes will sync when reconnected'}
        className="flex items-center gap-1.5 rounded-full border border-ink/10 px-2 py-0.5 text-[10px] font-medium text-ink-faint dark:border-white/10"
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'live' && 'bg-emerald-500',
            status === 'connecting' && 'animate-pulse bg-amber-500',
            status === 'offline' && 'bg-ink-faint',
          )}
        />
        {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
      </span>
    </div>
  );
}
