// A pinned-URL panel, same idea as Zoho Mail's "New Web Tab" — paste any
// URL, it's saved, and shown in an iframe inside Docket's own layout.
//
// This works well for things like a portfolio site, a job board, or an
// internal tool. It does NOT work for sites that set an X-Frame-Options
// or Content-Security-Policy header refusing to be framed — Gmail,
// most banks, and many login-walled apps all do this deliberately, on
// their own servers, as a clickjacking defense. No code on Docket's
// side (or Zoho's — same caveat shows on their "New Web Tab" form) can
// override that; the browser is honoring a header the target site
// sent. When that happens the iframe just renders blank, which is why
// every tab gets an "Open in new tab" fallback right next to it.

import { useMemo, useState } from 'react';
import { Plus, X, ExternalLink, Globe, Pencil, ShieldAlert } from 'lucide-react';
import { useWebTabsStore, normalizeUrl } from '@/store/useWebTabsStore';
import { useToastStore } from '@/store/useToastStore';
import { isKnownUnframeable } from '@/lib/unframeableHosts';

export function WebTabsPage() {
  const tabs = useWebTabsStore((s) => s.tabs);
  const addTab = useWebTabsStore((s) => s.addTab);
  const removeTab = useWebTabsStore((s) => s.removeTab);
  const renameTab = useWebTabsStore((s) => s.renameTab);

  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(tabs.length === 0);
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  // Bumping this forces the iframe to remount, which is the only way to
  // retry a load after e.g. a transient network error — iframes don't
  // expose a "reload" API of their own.
  const [reloadKey, setReloadKey] = useState(0);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  // Some sites (Gmail, banks, most social apps) send headers that
  // refuse iframe embedding outright — no amount of retrying or sandbox
  // tweaking gets around that, since it's the target server's own
  // clickjacking defense. For those, skip the doomed iframe attempt
  // and go straight to a clear explanation + "Open in new tab" instead
  // of a blank panel that looks broken.
  const activeIsUnframeable = useMemo(() => {
    if (!active) return false;
    try {
      return isKnownUnframeable(new URL(active.url).hostname);
    } catch {
      return false;
    }
  }, [active]);

  function openActiveInNewTab() {
    if (!active) return;
    window.open(active.url, '_blank', 'noopener,noreferrer');
    useToastStore
      .getState()
      .push({ message: 'Opened in a new tab.', tone: 'default', duration: 3000 });
  }

  function handleAdd() {
    const normalized = normalizeUrl(urlInput);
    if (!normalized) {
      setUrlError('Enter a valid URL, like gmail.com or https://example.com');
      return;
    }
    const tab = addTab(nameInput, normalized);
    setActiveId(tab.id);
    setNameInput('');
    setUrlInput('');
    setUrlError(null);
    setShowAdd(false);
  }

  function handleRemove(id: string) {
    removeTab(id);
    if (activeId === id) {
      const remaining = tabs.filter((t) => t.id !== id);
      setActiveId(remaining[0]?.id ?? null);
    }
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameInput(currentName);
  }

  function commitRename() {
    if (renamingId) renameTab(renamingId, renameInput);
    setRenamingId(null);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Tab list — narrow rail on the left, matches the Sidebar's own width feel */}
      <div className="flex w-56 shrink-0 flex-col border-r border-ink/10 dark:border-white/10">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="font-display text-sm font-semibold">Web Tabs</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-full p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
            aria-label="Add web tab"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-0.5 overflow-auto px-2 pb-3">
          {tabs.length === 0 && !showAdd && (
            <p className="px-2.5 py-4 text-xs text-ink-faint">
              No web tabs yet. Paste a link to pin it here.
            </p>
          )}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm ${
                tab.id === activeId
                  ? 'bg-brass text-white shadow-stamp'
                  : 'text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5'
              }`}
            >
              {renamingId === tab.id ? (
                <input
                  autoFocus
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded bg-white/20 px-1.5 py-0.5 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => setActiveId(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={tab.url}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
                  <span className="truncate">{tab.name}</span>
                </button>
              )}
              <button
                onClick={() => startRename(tab.id, tab.name)}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-100"
                aria-label="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleRemove(tab.id)}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-100"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {showAdd && (
          <div className="space-y-2 border-t border-ink/10 p-3 dark:border-white/10">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name (e.g. Gmail)"
              className="w-full rounded-lg border border-ink/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-brass dark:border-white/15"
            />
            <input
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setUrlError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Paste URL — e.g. gmail.com"
              className="w-full rounded-lg border border-ink/15 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-brass dark:border-white/15"
            />
            {urlError && <p className="text-xs text-brick">{urlError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                className="flex-1 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-white"
              >
                Add tab
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-full px-3 py-1.5 text-xs text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Viewer */}
      <div className="flex flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5 dark:border-white/10">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{active.name}</p>
                <p className="truncate font-mono text-[11px] text-ink-faint">{active.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  Reload
                </button>
                <a
                  href={active.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    useToastStore
                      .getState()
                      .push({ message: 'If the page below looks blank, this opens it in a new tab instead.', tone: 'default', duration: 4000 })
                  }
                  className="flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/10 dark:bg-white/5 dark:text-paper/70 dark:hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </div>
            </div>
            {activeIsUnframeable ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white text-center dark:bg-transparent">
                <ShieldAlert className="h-8 w-8 text-ink-faint opacity-60" />
                <div className="max-w-xs space-y-1">
                  <p className="text-sm font-medium">This site can't be shown here</p>
                  <p className="text-xs text-ink-faint">
                    {new URL(active.url).hostname} blocks itself from opening
                    inside other websites — a security setting on their end,
                    not something wrong with Docket.
                  </p>
                </div>
                <button
                  onClick={openActiveInNewTab}
                  className="mt-1 flex items-center gap-1.5 rounded-full bg-brass px-4 py-1.5 text-xs font-semibold text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </button>
              </div>
            ) : (
              <iframe
                key={`${active.id}-${reloadKey}`}
                src={active.url}
                title={active.name}
                className="flex-1 bg-white"
                // Intentionally permissive — this panel is for the
                // person's own trusted links (their portfolio, a job
                // board), not arbitrary third-party content, so the
                // embedded page needs to actually be able to run its own
                // scripts/forms/popups to function normally.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-ink-faint">
            <Globe className="h-8 w-8 opacity-40" />
            <p className="text-sm">Add a web tab to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
