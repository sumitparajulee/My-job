import { type ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import type { Recruiter } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useToastStore } from '@/store/useToastStore';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  position: z.string().optional(),
  companyId: z.string().optional(),
  email: z.string().email('Must be a valid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  linkedin: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  nextFollowUp: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function recruiterToFormValues(recruiter: Recruiter | null): FormValues {
  return {
    name: recruiter?.name ?? '',
    position: recruiter?.position ?? '',
    companyId: recruiter?.companyId ?? '',
    email: recruiter?.email ?? '',
    phone: recruiter?.phone ?? '',
    linkedin: recruiter?.linkedin ?? '',
    nextFollowUp: recruiter?.nextFollowUp?.slice(0, 10) ?? '',
    notes: recruiter?.notes ?? '',
  };
}

export function RecruiterFormModal({
  recruiter,
  onClose,
}: {
  recruiter: Recruiter | null; // null = creating a new recruiter
  onClose: () => void;
}) {
  const companies = useDocketStore((s) => s.companies);
  const createRecruiter = useDocketStore((s) => s.createRecruiter);
  const updateRecruiter = useDocketStore((s) => s.updateRecruiter);
  const deleteRecruiter = useDocketStore((s) => s.deleteRecruiter);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: recruiterToFormValues(recruiter),
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
      position: values.position || undefined,
      companyId: values.companyId || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      linkedin: values.linkedin || undefined,
      nextFollowUp: values.nextFollowUp || undefined,
      notes: values.notes || undefined,
    };
    if (recruiter) {
      await updateRecruiter(recruiter.id, patch);
    } else {
      await createRecruiter(patch);
    }
    useToastStore.getState().push({
      message: recruiter ? `Saved "${values.name}"` : `Added "${values.name}"`,
      tone: 'success',
      duration: 2500,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!recruiter) return;
    await deleteRecruiter(recruiter.id);
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
            {recruiter ? 'Edit recruiter' : 'New recruiter'}
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
              <input {...register('name')} className="input" placeholder="Jamie Chen" />
            </Field>
            <Field label="Position">
              <input {...register('position')} className="input" placeholder="Technical Recruiter" />
            </Field>
          </div>

          <Field label="Company">
            <select {...register('companyId')} className="input">
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" error={errors.email?.message}>
              <input {...register('email')} className="input" placeholder="jamie@company.com" />
            </Field>
            <Field label="Phone">
              <input {...register('phone')} className="input" placeholder="+61…" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="LinkedIn" error={errors.linkedin?.message}>
              <input {...register('linkedin')} className="input" placeholder="https://linkedin.com/in/…" />
            </Field>
            <Field label="Next follow-up">
              <input type="date" {...register('nextFollowUp')} className="input" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea {...register('notes')} rows={3} className="input resize-none" />
          </Field>

          <div className="flex items-center justify-between pt-2">
            {recruiter ? (
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
                {recruiter ? 'Save changes' : 'Add recruiter'}
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
