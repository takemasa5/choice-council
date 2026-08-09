import { useRef, useState } from "react";
import type {
  ExpertComment,
  ExpertCommentRequest,
  ExpertRequest,
  Phase,
  SessionMemo,
} from "../../shared/schemas/session";
import { SessionMemoSchema } from "../../shared/schemas/session";
import {
  collectExpertCommentGenerationResults,
  confirmExpertDrafts,
} from "../facilitator-flow";

/** 日本語名: 画面上の候補行を識別する安定ID付き専門家候補。 */
export type ExpertDraft = ExpertRequest & { draftId: string };

export function shouldPreserveRestoredExpertDrafts(
  restoredCandidateKey: string | null,
  candidateKey: string,
) {
  return restoredCandidateKey === candidateKey;
}

/**
 * 日本語名: 専門家候補の編集・確定・コメント生成で使うフェーズ状態を管理するHook。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#前提整理・専門家選定の分離`。
 */
export function useExpertSelectionPhase({
  getContext,
  getRequiredQuestionMessage,
  isInteractionDisabled,
  onConfirmed,
  onGenerationStarted,
  onCommentsGenerated,
}: {
  getContext: () => {
    consultation: string;
    currentPhase: Phase;
    memo: SessionMemo | null;
  };
  getRequiredQuestionMessage: () => string;
  isInteractionDisabled: () => boolean;
  onConfirmed: (experts: ExpertRequest[]) => void;
  onGenerationStarted: () => void;
  onCommentsGenerated: (memo: SessionMemo) => void;
}) {
  const [expertDrafts, setExpertDrafts] = useState<ExpertDraft[]>([]);
  const [expertDraftProvenanceKey, setExpertDraftProvenanceKey] = useState<
    string | null
  >(null);
  const [initialExpertRequests, setInitialExpertRequests] = useState<
    ExpertRequest[]
  >([]);
  const [confirmedExperts, setConfirmedExperts] = useState<ExpertRequest[]>([]);
  const [expertComments, setExpertComments] = useState<ExpertComment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const draftIdRef = useRef(0);
  const confirmedRequestKeyRef = useRef("");
  const restoredDraftCandidateKeyRef = useRef<string | null>(null);
  const shouldGenerateReturnedCommentsRef = useRef(false);
  const isCommentGenerationInFlightRef = useRef(false);

  function createDraft(expert: ExpertRequest): ExpertDraft {
    draftIdRef.current += 1;
    return { ...expert, draftId: `expert-draft-${draftIdRef.current}` };
  }

  function restoreDraftIdSequence(drafts: ExpertDraft[]) {
    draftIdRef.current = drafts.reduce((largestSequence, draft) => {
      const match = /^expert-draft-(\d+)$/.exec(draft.draftId);
      return match
        ? Math.max(largestSequence, Number(match[1]))
        : largestSequence;
    }, 0);
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

  /** 日本語名: 候補変更時に、候補に依存する確定・生成結果を破棄する。 */
  function resetSelection() {
    setConfirmedExperts([]);
    setExpertComments([]);
    setErrorMessage("");
    shouldGenerateReturnedCommentsRef.current = false;
  }

  /** 日本語名: 候補の編集と依存状態の破棄をまとめて行う操作。 */
  function updateExpertDraft(
    index: number,
    field: keyof ExpertRequest,
    value: string,
  ) {
    resetSelection();
    updateDraft(index, field, value);
  }

  /** 日本語名: 候補追加と依存状態の破棄をまとめて行う操作。 */
  function addExpertDraft() {
    resetSelection();
    addDraft();
  }

  /** 日本語名: 候補削除と依存状態の破棄をまとめて行う操作。 */
  function removeExpertDraft(index: number) {
    resetSelection();
    removeDraft(index);
  }

  /** 日本語名: 候補入替と依存状態の破棄をまとめて行う操作。 */
  function replaceExpertDraft(index: number) {
    resetSelection();
    replaceDraft(index);
  }

  /** 日本語名: 専門家コメントAPIへJSONを送信し、JSON応答を返す通信操作。 */
  async function requestComment(request: unknown): Promise<unknown> {
    const response = await fetch("/api/expert/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? body.message
          : undefined;
      throw new Error(
        typeof message === "string"
          ? message
          : "この発言の生成に失敗しました。再生成できます。",
      );
    }
    return body;
  }

  /** 日本語名: 初回専門家コメントを反映したセッションメモを更新する。 */
  async function updateSessionMemo({
    consultation,
    currentPhase,
    previousMemo,
    comments,
  }: {
    consultation: string;
    currentPhase: Phase;
    previousMemo: SessionMemo | null;
    comments: ExpertComment[];
  }): Promise<SessionMemo> {
    const response = await fetch("/api/session-memo/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultation,
        currentPhase,
        previousMemo: previousMemo ?? undefined,
        expertComments: comments,
      }),
    });
    const body: unknown = await response.json();
    const parsedMemo = SessionMemoSchema.safeParse(body);
    if (!response.ok || !parsedMemo.success) {
      throw new Error(
        "専門家コメントの生成に失敗しました。もう一度お試しください。",
      );
    }
    return parsedMemo.data;
  }

  /** 日本語名: 編集済み候補を検証し、確定結果だけを横断状態へ渡す。 */
  function confirmDrafts(): Promise<void> | void {
    if (isInteractionDisabled()) return;
    const requiredQuestionMessage = getRequiredQuestionMessage();
    if (requiredQuestionMessage)
      return setErrorMessage(requiredQuestionMessage);
    const confirmation = confirmExpertDrafts(expertDrafts);
    if (confirmation.errorMessage)
      return setErrorMessage(confirmation.errorMessage);
    const shouldGenerateReturnedComments =
      shouldGenerateReturnedCommentsRef.current;
    setConfirmedExperts(confirmation.experts);
    confirmedRequestKeyRef.current = JSON.stringify(confirmation.experts);
    setExpertComments([]);
    setErrorMessage("");
    onConfirmed(confirmation.experts);
    if (shouldGenerateReturnedComments) {
      shouldGenerateReturnedCommentsRef.current = false;
      return generateComments(confirmation.experts);
    }
  }

  /** 日本語名: 初期候補を編集せず確定する。 */
  function confirmInitialDrafts() {
    if (isInteractionDisabled()) return;
    const confirmation = confirmExpertDrafts(initialExpertRequests);
    if (confirmation.errorMessage)
      return setErrorMessage(confirmation.errorMessage);
    setExpertDrafts(initialExpertRequests.map(createDraft));
    setExpertDraftProvenanceKey(JSON.stringify(initialExpertRequests));
    setConfirmedExperts(confirmation.experts);
    confirmedRequestKeyRef.current = JSON.stringify(confirmation.experts);
    setExpertComments([]);
    setErrorMessage("");
    onConfirmed(confirmation.experts);
  }

  /** 日本語名: 確定済み専門家の初回コメントを全件生成する。 */
  async function generateComments(
    expertsToGenerate = confirmedExperts,
  ): Promise<void> {
    if (isCommentGenerationInFlightRef.current || isInteractionDisabled())
      return;
    setErrorMessage("");
    const requiredQuestionMessage = getRequiredQuestionMessage();
    if (requiredQuestionMessage)
      return setErrorMessage(requiredQuestionMessage);
    if (expertsToGenerate.length === 0) {
      setErrorMessage("先に専門家ロールを確定してください。");
      return;
    }
    const { consultation, currentPhase, memo } = getContext();
    if (currentPhase === "premise") {
      setErrorMessage("先に専門家ロールを確定してください。");
      return;
    }
    const expertCommentPhase =
      currentPhase === "expert_selection" ? "deliberation" : currentPhase;
    isCommentGenerationInFlightRef.current = true;
    setIsGenerating(true);
    onGenerationStarted();
    try {
      const result = await collectExpertCommentGenerationResults(
        expertsToGenerate.map((expert) => async () => {
          const request: ExpertCommentRequest = {
            consultation,
            currentPhase: expertCommentPhase,
            memo: memo ?? undefined,
            expert,
          };
          return (await requestComment(request)) as ExpertComment;
        }),
      );
      if (result.errorMessage) {
        setExpertComments([]);
        setErrorMessage(result.errorMessage);
        return;
      }

      const updatedMemo = await updateSessionMemo({
        consultation,
        currentPhase,
        previousMemo: memo,
        comments: result.comments,
      });
      setExpertComments(result.comments);
      confirmedRequestKeyRef.current = JSON.stringify(expertsToGenerate);
      onCommentsGenerated(updatedMemo);
    } catch {
      setExpertComments([]);
      setErrorMessage(
        "専門家コメントの生成に失敗しました。もう一度お試しください。",
      );
    } finally {
      isCommentGenerationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }

  /** 日本語名: 保存済みの専門家選定状態をまとめて復元する。 */
  function restoreSelection({
    initialCandidates,
    confirmedCandidates,
    comments,
    drafts,
    restoredDraftProvenanceKey,
  }: {
    initialCandidates: ExpertRequest[];
    confirmedCandidates: ExpertRequest[];
    comments: ExpertComment[];
    drafts?: ExpertDraft[];
    restoredDraftProvenanceKey?: string;
  }) {
    confirmedRequestKeyRef.current = JSON.stringify(confirmedCandidates);
    shouldGenerateReturnedCommentsRef.current = false;
    if (drafts !== undefined) {
      restoreDraftIdSequence(drafts);
      setExpertDrafts(drafts);
      setExpertDraftProvenanceKey(restoredDraftProvenanceKey ?? null);
      restoredDraftCandidateKeyRef.current = restoredDraftProvenanceKey ?? null;
    } else {
      setExpertDraftProvenanceKey(null);
      restoredDraftCandidateKeyRef.current = null;
    }
    setInitialExpertRequests(initialCandidates);
    setConfirmedExperts(confirmedCandidates);
    setExpertComments(comments);
  }

  /** 日本語名: ファシリテーター応答の候補を編集用行へ同期する。 */
  function synchronizeCandidates(
    candidates: ExpertRequest[],
    candidateKey: string,
  ) {
    if (
      shouldPreserveRestoredExpertDrafts(
        restoredDraftCandidateKeyRef.current,
        candidateKey,
      )
    ) {
      restoredDraftCandidateKeyRef.current = null;
      return;
    }
    restoredDraftCandidateKeyRef.current = null;
    setExpertDrafts(candidates.map(createDraft));
    setExpertDraftProvenanceKey(candidateKey);
    if (confirmedRequestKeyRef.current === candidateKey) {
      confirmedRequestKeyRef.current = "";
    } else {
      setConfirmedExperts([]);
    }
    setErrorMessage("");
  }

  /** 日本語名: 初期候補を設定する。 */
  function setInitialCandidates(candidates: ExpertRequest[]) {
    setInitialExpertRequests(candidates);
  }

  /** 日本語名: 専門家選定の全ローカル状態を破棄する。 */
  function resetSelectionState() {
    setExpertDrafts([]);
    setExpertDraftProvenanceKey(null);
    setInitialExpertRequests([]);
    setConfirmedExperts([]);
    setExpertComments([]);
    setIsGenerating(false);
    setErrorMessage("");
    confirmedRequestKeyRef.current = "";
    restoredDraftCandidateKeyRef.current = null;
    shouldGenerateReturnedCommentsRef.current = false;
    isCommentGenerationInFlightRef.current = false;
  }

  /** 日本語名: 戻り先に応じて確定候補・コメントだけを復元する。 */
  function restoreForPhase({
    initialCandidates,
    confirmedCandidates,
    comments,
    drafts,
    draftProvenanceKey,
  }: {
    initialCandidates: ExpertRequest[];
    confirmedCandidates: ExpertRequest[];
    comments: ExpertComment[];
    drafts?: ExpertDraft[];
    draftProvenanceKey?: string | null;
  }) {
    confirmedRequestKeyRef.current = JSON.stringify(confirmedCandidates);
    shouldGenerateReturnedCommentsRef.current =
      confirmedCandidates.length > 0 && comments.length === 0;
    setExpertDrafts(drafts ?? []);
    setExpertDraftProvenanceKey(draftProvenanceKey ?? null);
    setInitialExpertRequests(initialCandidates);
    setConfirmedExperts(confirmedCandidates);
    setExpertComments(comments);
    setErrorMessage("");
    restoredDraftCandidateKeyRef.current = draftProvenanceKey ?? null;
  }

  return {
    expertDrafts,
    expertDraftProvenanceKey,
    initialExpertRequests,
    confirmedExperts,
    expertComments,
    isGenerating,
    errorMessage,
    updateDraft,
    addDraft,
    removeDraft,
    replaceDraft,
    updateExpertDraft,
    addExpertDraft,
    removeExpertDraft,
    replaceExpertDraft,
    confirmDrafts,
    confirmInitialDrafts,
    generateComments,
    restoreSelection,
    synchronizeCandidates,
    setInitialCandidates,
    resetSelectionState,
    restoreForPhase,
    reportError: setErrorMessage,
  };
}
