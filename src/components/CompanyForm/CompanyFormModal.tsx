import { type ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import {
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
  FUNDING_STAGES,
  FUNDING_STAGE_LABELS,
  type Company,
} from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useToastStore } from '@/store/useToastStore';

const schema = z.object({
  name: z.string().min(1, 'Company name is required'),
  website: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  industry: z.string().optional(),
  fundingStage: z.enum(FUNDING_STAGES).optional(),
  companySize: z.enum(COMPANY_SIZES).optional(),
  glassdoorRating: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= 1 && Number(v) <= 5), 'Must be between 1 and 5'),
  recentNews: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function companyToFormValues(company: Company | null): FormValues {
  return {
    name: company?.name ?? '',
    website: company?.website ?? '',
    industry: company?.industry ?? '',
    fundingStage: company?.fundingStage,
    companySize: company?.companySize,
    glassdoorRating: company?.glassdoorRating != null ? String(company.glassdoorRating) : '',
    recentNews: company?.recentNews ?? '',
    notes: company?.notes ?? '',
  };
}

export function CompanyFormModal({
  company,
  onClose,
}: {
  company: Company | null; // null = creating a new company
  onClose: () => void;
}) {
  const upsertCompany = useDocketStore((s) => s.upsertCompany);
  const updateCompany = useDocketStore((s) => s.updateCompany);
  const deleteCompany = useDocketStore((s) => s.deleteCompany);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: companyToFormValues(company),
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
      website: values.website || undefined,
      industry: values.industry || undefined,
      fundingStage: values.fundingStage,
      companySize: values.companySize,
      glassdoorRating: values.glassdoorRating ? Number(values.glassdoorRating) : undefined,
      recentNews: values.recentNews || undefined,
      notes: values.notes || undefined,
    };
    if (company) {
      await updateCompany(company.id, patch);
    } else {
      await upsertCompany(values.name, patch);
    }
    useToastStore.getState().push({
      message: company ? `Saved "${values.name}"` : `Added "${values.name}"`,
      tone: 'success',
      duration: 2500,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!company) return;
    await deleteCompany(company.id);
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
            {company ? 'Edit company' : 'New company'}
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
          <Field label="Company name" error={errors.name?.message}>
            <input {...register('name')} className="input" placeholder="Acme Inc." />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Website" error={errors.website?.message}>
              <input {...register('website')} className="input" placeholder="https://…" />
            </Field>
            <Field label="Industry">
              <input {...register('industry')} className="input" placeholder="Software" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Funding stage">
              <select {...register('fundingStage')} className="input">
                <option value="">—</option>
                {FUNDING_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {FUNDING_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company size">
              <select {...register('companySize')} className="input">
                <option value="">—</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {COMPANY_SIZE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Glassdoor rating (1–5)" error={errors.glassdoorRating?.message}>
            <input
              {...register('glassdoorRating')}
              type="number"
              step="0.1"
              min="1"
              max="5"
              className="input"
              placeholder="4.2"
            />
          </Field>

          <Field label="Recent news">
            <textarea
              {...register('recentNews')}
              rows={2}
              className="input resize-none"
              placeholder="Layoffs announced Q2, new CEO, funding round…"
            />
          </Field>

          <Field label="Notes">
            <textarea {...register('notes')} rows={4} className="input resize-none" />
          </Field>

          <div className="flex items-center justify-between pt-2">
            {company ? (
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
                {company ? 'Save changes' : 'Add company'}
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
