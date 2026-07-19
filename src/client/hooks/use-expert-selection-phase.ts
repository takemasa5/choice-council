import { useRef, useState } from "react";
import type {
  ExpertComment,
  ExpertRequest,
} from "../../shared/schemas/session";

/** 日本語名: 画面上の候補行を識別する安定ID付き専門家候補。 */
export type ExpertDraft = ExpertRequest & { draftId: string };

/**
 * 日本語名: 専門家候補の編集・確定・コメント生成で使うフェーズ状態を管理するHook。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#状態と副作用の境界`。
 */
export function useExpertSelectionPhase() {
  const [expertDrafts, setExpertDrafts] = useState<ExpertDraft[]>([]);
  const [initialExpertRequests, setInitialExpertRequests] = useState<
    ExpertRequest[]
  >([]);
  const [confirmedExperts, setConfirmedExperts] = useState<ExpertRequest[]>([]);
  const [expertComments, setExpertComments] = useState<ExpertComment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const draftIdRef = useRef(0);
  const confirmedRequestKeyRef = useRef("");

  function createDraft(expert: ExpertRequest): ExpertDraft {
    draftIdRef.current += 1;
    return { ...expert, draftId: `expert-draft-${draftIdRef.current}` };
  }

  /** 日本語名: 専門家候補の指定フィールドを更新するローカル操作。 */
  function updateDraft(
    index: number,
    field: keyof ExpertRequest,
    value: string,
  ) {
    setExpertDrafts((current) =>
      current.map((expert, currentIndex) =>
        currentIndex === index ? { ...expert, [field]: value } : expert,
      ),
    );
  }

  /** 日本語名: 空の専門家候補を末尾へ追加するローカル操作。 */
  function addDraft() {
    setExpertDrafts((current) => [
      ...current,
      createDraft({ role_name: "", viewpoint: "", request: "" }),
    ]);
  }

  /** 日本語名: 指定した専門家候補を削除するローカル操作。 */
  function removeDraft(index: number) {
    setExpertDrafts((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  /** 日本語名: 指定した専門家候補の入力を空へ戻すローカル操作。 */
  function replaceDraft(index: number) {
    setExpertDrafts((current) =>
      current.map((expert, currentIndex) =>
        currentIndex === index
          ? { ...expert, role_name: "", viewpoint: "", request: "" }
          : expert,
      ),
    );
  }

  return {
    expertDrafts,
    setExpertDrafts,
    initialExpertRequests,
    setInitialExpertRequests,
    confirmedExperts,
    setConfirmedExperts,
    expertComments,
    setExpertComments,
    isGenerating,
    setIsGenerating,
    errorMessage,
    setErrorMessage,
    confirmedRequestKeyRef,
    createDraft,
    updateDraft,
    addDraft,
    removeDraft,
    replaceDraft,
  };
}
