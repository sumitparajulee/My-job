import { useState } from 'react';
import { X } from 'lucide-react';
import { SOFTWARE_SUGGESTIONS } from '@/types/models';

// Matches a typed value against the canonical suggestion list (and
// whatever's already used elsewhere in the job's own selection)
// case-insensitively, so "xero" / "Xero" / "XERO" all collapse to the
// same canonical "Xero" tag. This is the actual anti-duplication
// mechanism the person asked for - without it, the software filter on
// the board would silently miss jobs tagged with a differently-cased
// spelling of the same tool.
function normalizeSoftwareName(raw: string, known: readonly string[]): string {
  const trimmed = raw.trim();
  const match = known.find((k) => k.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function SoftwareInput({
  value,
  onChange,
  allKnownSoftware,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  // Canonical suggestions plus every distinct value already used across
  // other jobs, so a name typed once (even a custom one not in
  // SOFTWARE_SUGGESTIONS) gets suggested - and reused verbatim - the
  // next time, instead of drifting into near-duplicate spellings.
  allKnownSoftware: string[];
}) {
  const [draft, setDraft] = useState('');

  function addFromDraft() {
    const text = draft.trim();
    if (!text) return;
    const normalized = normalizeSoftwareName(text, allKnownSoftware);
    if (!value.some((v) => v.toLowerCase() === normalized.toLowerCase())) {
      onChange([...value, normalized]);
    }
    setDraft('');
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  const suggestions = [...new Set([...SOFTWARE_SUGGESTIONS, ...allKnownSoftware])].sort();

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {value.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded-full bg-brass/15 px-2 py-0.5 text-xs font-medium text-brass-dim dark:bg-brass/20"
            >
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="text-brass-dim/70 hover:text-brick"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addFromDraft();
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={addFromDraft}
        list="software-suggestions"
        placeholder="Xero, MYOB..."
        className="input"
      />
      <datalist id="software-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
