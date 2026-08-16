import { Construction } from 'lucide-react';

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Construction className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
      <h2 className="font-display text-xl font-medium">{title}</h2>
      <p className="max-w-xs text-sm text-ink-faint">
        Not built yet — landing in {phase}. The Board is fully wired up in the meantime.
      </p>
    </div>
  );
}
