import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';

const ICONS = {
  default: Info,
  success: CheckCircle2,
  danger: AlertCircle,
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone ?? 'default'];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-ink/10 bg-white px-3.5 py-3 shadow-xl dark:border-white/10 dark:bg-night-panel"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  t.tone === 'success'
                    ? 'text-forest'
                    : t.tone === 'danger'
                      ? 'text-brick'
                      : 'text-brass'
                }`}
              />
              <p className="flex-1 text-sm text-ink dark:text-paper">{t.message}</p>
              {t.actionLabel && (
                <button
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="shrink-0 text-sm font-semibold text-brass hover:underline"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-ink-faint hover:text-ink dark:hover:text-paper"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
