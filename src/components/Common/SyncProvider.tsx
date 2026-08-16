import { useEffect } from 'react';
import { isSyncConfigured } from '@/lib/firebase';
import { subscribeToWorkspace } from '@/lib/syncEngine';
import { useDocketStore, LOCAL_WORKSPACE_ID } from '@/store/useDocketStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useSyncStore } from '@/store/useSyncStore';

export function SyncProvider() {
  const workspace = useSessionStore((s) => s.workspace);
  const member = useSessionStore((s) => s.member);
  const init = useDocketStore((s) => s.init);
  const reset = useDocketStore((s) => s.reset);
  const applyRemoteChange = useDocketStore((s) => s.applyRemoteChange);
  const setStatus = useSyncStore((s) => s.setStatus);
  const setPresence = useSyncStore((s) => s.setPresence);
  const setEnabled = useSyncStore((s) => s.setEnabled);

  useEffect(() => {
    setEnabled(isSyncConfigured);
    if (!isSyncConfigured) {
      void init(LOCAL_WORKSPACE_ID, null);
      return;
    }
    // Sync is configured but no workspace chosen yet (still signing in) —
    // nothing to load or subscribe to.
    if (!workspace || !member) return;

    reset();
    void init(workspace.id, member.userId);

    const unsubscribe = subscribeToWorkspace(
      workspace.id,
      {
        userId: member.userId,
        displayName: member.displayName ?? 'Someone',
        color: member.color,
      },
      {
        onChange: applyRemoteChange,
        onPresence: setPresence,
        onStatus: setStatus,
      },
    );

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, member?.userId]);

  return null;
}
