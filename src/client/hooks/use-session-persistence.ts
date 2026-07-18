import { useEffect } from "react";

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
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    try {
      restore(stored ? (JSON.parse(stored) as Session) : null);
    } catch {
      window.localStorage.removeItem(storageKey);
      restore(null);
    }
  }, [restore, storageKey]);

  useEffect(() => {
    if (!hasSessionContent()) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(createSession()));
    // 呼び出し元がフェーズ横断状態だけを明示的に列挙する。
  }, dependencies);
}
