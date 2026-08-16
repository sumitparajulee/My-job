import { type ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import { TEMPLATE_KINDS, TEMPLATE_KIND_LABELS, type MessageTemplate } from '@/types/models';
import { TEMPLATE_PLACEHOLDERS } from '@/lib/templateFill';
import { useTemplateStore } from '@/store/useTemplateStore';
import { useToastStore } from '@/store/useToastStore';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(TEMPLATE_KINDS),
  subject: z.string().optional(),
  body: z.string().min(1, 'Body is required'),
});

type FormValues = z.infer<typeof schema>;

function templateToFormValues(template: MessageTemplate | null): FormValues {
  return {
    name: template?.name ?? '',
    kind: template?.kind ?? 'follow_up',
    subject: template?.subject ?? '',
    body: template?.body ?? '',
  };
}

export function TemplateFormModal({
  template,
  onClose,
}: {
  template: MessageTemplate | null; // null = creating a new template
  onClose: () => void;
}) {
  const createTemplate = useTemplateStore((s) => s.createTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: templateToFormValues(template),
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    const patch = {
      name: values.name,
      kind: values.kind,
      subject: values.subject || undefined,
      body: values.body,
    };
    if (template) {
      await updateTemplate(template.id, patch);
    } else {
      await createTemplate(patch);
    }
    useToastStore.getState().push({
      message: template ? `Saved "${values.name}"` : `Added "${values.name}"`,
      tone: 'success',
      duration: 2500,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!template) return;
    await deleteTemplate(template.id);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-night-panel"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">
            {template ? 'Edit template' : 'New template'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" error={errors.name?.message}>
              <input {...register('name')} className="input" placeholder="One-week follow-up" />
            </Field>
            <Field label="Kind">
              <select {...register('kind')} className="input">
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Subject (optional, for emails)">
            <input {...register('subject')} className="input" placeholder="Following up on {{position}}" />
          </Field>

          <Field label="Body" error={errors.body?.message}>
            <textarea
              {...register('body')}
              rows={8}
              className="input resize-none font-mono text-xs"
              placeholder={`Hi {{recruiterName}},\n\nJust checking in on my application for {{position}} at {{company}}...`}
            />
          </Field>

          <div className="rounded-md border border-ink/10 bg-ink/[0.02] px-3 py-2.5 text-xs text-ink-faint dark:border-white/10 dark:bg-white/[0.02]">
            <p className="mb-1 font-medium text-ink-soft dark:text-paper/60">Placeholders you can use:</p>
            <p className="font-mono">
              {TEMPLATE_PLACEHOLDERS.map((p) => p.token).join('  ')}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            {template ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-brick hover:bg-brick/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-60"
              >
                {template ? 'Save changes' : 'Add template'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft dark:text-paper/60">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-brick">{error}</span>}
    </label>
  );
}
