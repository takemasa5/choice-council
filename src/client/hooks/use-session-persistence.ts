import { useEffect, useRef, useState } from "react";

/**
 * 日本語名: フェーズ横断のセッション保存・復元を一元化する Hook。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#状態と副作用の境界`。
 */
export function useSessionPersistence<Session>({
  storageKey,
  restore,
  createSession,
  hasSessionContent,
  dependencies,
}: {
  storageKey: string;
  restore: (session: Session | null) => void;
  createSession: () => Session;
  hasSessionContent: () => boolean;
  dependencies: readonly unknown[];
}) {
  const restoreRef = useRef(restore);
  const createSessionRef = useRef(createSession);
  const hasSessionContentRef = useRef(hasSessionContent);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);

  restoreRef.current = restore;
  createSessionRef.current = createSession;
  hasSessionContentRef.current = hasSessionContent;

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    try {
      restoreRef.current(stored ? (JSON.parse(stored) as Session) : null);
    } catch {
      window.localStorage.removeItem(storageKey);
      restoreRef.current(null);
    } finally {
      setHasRestoredSession(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hasRestoredSession || !hasSessionContentRef.current()) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(createSessionRef.current()),
    );
    // 呼び出し元がフェーズ横断状態だけを明示的に列挙する。
  }, [hasRestoredSession, storageKey, ...dependencies]);

  return { hasRestoredSession };
}
