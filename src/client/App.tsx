import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConsultationStartRequest,
  ExpertRequest,
  FacilitatorTurn,
  FacilitatorResponse,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import {
  canProceedToExpertSelection,
  getFacilitatorResponsePhase,
  getInitialExpertRequests,
  getSessionConsultation,
  isExpertDraftEditingDisabled,
} from "./facilitator-flow";
import {
  getConfirmedExpertsForReturn,
  getExpertCommentsForReturn,
} from "./phase-history";
import { useGroupChatPhase } from "./hooks/use-group-chat-phase";
import { usePremisePhase } from "./hooks/use-premise-phase";
import { useConsultationPhase } from "./hooks/use-consultation-phase";
import { useFinalMemoPhase } from "./hooks/use-final-memo-phase";
import { useFacilitatorPhaseFlow } from "./hooks/use-facilitator-phase-flow";
import { useExpertSelectionPhase } from "./hooks/use-expert-selection-phase";
import { useSessionPersistence } from "./hooks/use-session-persistence";
import { useDeliberationPhaseFlow } from "./hooks/use-deliberation-phase-flow";
import {
  applyGroupChatMemoUpdate,
  applyPremiseSessionResponse,
  createInitialSessionState,
  createSessionRequest,
  createStoredSession,
  getAvailableReturnPhases,
  getCurrentSessionMemo,
  proceedToExpertSelection as proceedSessionToExpertSelection,
  restoreGroupChatAfterFinalMemoFailure as restoreSessionGroupChatAfterFinalMemoFailure,
  restoreStoredSessionState,
  returnToPhase as returnSessionToPhase,
  saveConfirmedExperts,
  settleExpertComments,
  settleFinalMemo,
  settleGroupChatStart as settleSessionGroupChatStart,
  startSession,
  type StoredSession,
} from "./session-lifecycle";
import { AppPhaseRouter } from "./phases/AppPhaseRouter";
import { createPhaseContent } from "./phases/create-phase-content";
import { FinalMemoPhaseConnection } from "./phases/FinalMemoPhaseConnection";
import { MemoView } from "./MemoView";
import "./styles.css";

const storageKey = "choice-council-session";
const phaseLabels: Record<Phase, string> = {
  consultation_input: "相談入力",
  premise: "前提整理",
  expert_selection: "専門家選定",
  deliberation: "検討",
  group_chat: "意見交換",
  final_memo: "終了メモ",
};

/** 日本語名: フェーズ横断のセッション状態とアプリケーションシェルを管理するコンポーネント。 */
export function App() {
  const finalMemoPhase = useFinalMemoPhase({
    onStatusConfirmed: settleFinalMemoGeneration,
    onGenerationFailed: restoreGroupChatAfterFinalMemoFailure,
  });
  const {
    consultation,
    changeConsultation,
    facts,
    changeFacts,
    values,
    changeValues,
    concerns,
    changeConcerns,
    expectedOutcome,
    changeExpectedOutcome,
  } = useConsultationPhase();
  const [sessionState, setSessionState] = useState(createInitialSessionState);
  const { startedConsultation, response, responseHistory, currentPhase } =
    sessionState;
  const [isMobileMemoOpen, setIsMobileMemoOpen] = useState(false);
  const [isMemoUpdateNoticeVisible, setIsMemoUpdateNoticeVisible] =
    useState(false);
  const memoUpdateNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const facilitatorFlow = useFacilitatorPhaseFlow();
  const {
    isLoading,
    errorMessage,
    failedRequest: failedFacilitatorRequest,
  } = facilitatorFlow;
  const {
    selectedQuestionOption,
    selectQuestionOption,
    otherQuestionAnswer,
    changeOtherQuestionAnswer,
    clearQuestionAnswer,
    restoreQuestionAnswer,
    getAnswer: getPremiseAnswer,
    submitAnswer,
  } = usePremisePhase({
    consultation: getSessionConsultation(startedConsultation, consultation),
    currentPhase,
    response,
    onSubmitRequest: (input) =>
      facilitatorFlow.respond({ input, onSuccess: applyPremiseResponse }),
    onValidationError: facilitatorFlow.reportValidationError,
  });
  const {
    expertDrafts,
    initialExpertRequests,
    confirmedExperts,
    expertComments,
    expertDraftProvenanceKey,
    isGenerating: isGeneratingExperts,
    errorMessage: expertErrorMessage,
    updateExpertDraft: updateExpertDraftOperation,
    addExpertDraft: addExpertDraftOperation,
    removeExpertDraft: removeExpertDraftOperation,
    replaceExpertDraft: replaceExpertDraftOperation,
    confirmDrafts: confirmExpertDrafts,
    confirmInitialDrafts: confirmInitialExpertDrafts,
    generateComments: generateExpertComments,
    restoreSelection,
    synchronizeCandidates,
    setInitialCandidates,
    resetSelectionState,
    restoreForPhase,
  } = useExpertSelectionPhase({
    getContext: () => ({
      consultation: sessionConsultation,
      currentPhase,
      memo,
    }),
    getRequiredQuestionMessage: getPendingRequiredQuestionMessage,
    isInteractionDisabled: () => isExpertInteractionDisabled,
    onConfirmed: saveConfirmedExpertDrafts,
    onGenerationStarted: () => {
      finalMemoPhase.clear();
    },
    onCommentsGenerated: settleExpertCommentsMemo,
  });
  const groupChatPhase = useGroupChatPhase({
    onInitialTurn: settleGroupChatStart,
    onTurnUpdated: applyGroupChatTurnUpdate,
  });
  const {
    state: groupChat,
    isLoading: isStartingGroupChat,
    errorMessage: groupChatErrorMessage,
  } = groupChatPhase;
  const deliberationFlow = useDeliberationPhaseFlow({
    onReset: groupChatPhase.reset,
    onStarted: (request, turn) => groupChatPhase.begin({ request, turn }),
  });
  const {
    messages: groupChatMessages,
    turn: groupChatTurn,
    contextSummary: groupChatContextSummary,
    otherAnswer: groupChatOtherAnswer,
    expertRepliesSinceUser,
    isNextTurnRetryPending: groupChatNextTurnRetryPending,
  } = groupChat;
  const {
    finalMarkdown,
    isGenerating: isGeneratingFinalMarkdown,
    errorMessage: finalMarkdownErrorMessage,
  } = finalMemoPhase;
  const isGroupChatBusy = isStartingGroupChat || deliberationFlow.isStarting;
  const isExpertInteractionDisabled =
    isExpertDraftEditingDisabled(isGeneratingExperts) || isGroupChatBusy;
  const expertRequestKey = useMemo(() => {
    return JSON.stringify(response?.expert_requests ?? []);
  }, [response?.expert_requests]);
  const shouldSkipRestoredCandidateSyncRef = useRef(false);

  useEffect(() => {
    return stopMemoUpdatedNoticeTimer;
  }, []);

  const { hasRestoredSession } = useSessionPersistence<StoredSession>({
    storageKey,
    restore: restoreSession,
    createSession: buildStoredSession,
    hasSessionContent: () =>
      Boolean(
        consultation.trim() ||
        facts.trim() ||
        values.trim() ||
        concerns.trim() ||
        expectedOutcome.trim() ||
        response ||
        Object.keys(responseHistory).length > 0 ||
        expertDrafts.length > 0 ||
        expertComments.length > 0 ||
        finalMarkdown,
      ),
    dependencies: [
      consultation,
      startedConsultation,
      facts,
      values,
      concerns,
      expectedOutcome,
      response,
      responseHistory,
      currentPhase,
      expertComments,
      expertDrafts,
      expertDraftProvenanceKey,
      confirmedExperts,
      groupChatMessages,
      groupChatTurn,
      groupChatContextSummary,
      expertRepliesSinceUser,
      groupChatNextTurnRetryPending,
      initialExpertRequests,
      finalMarkdown,
      selectedQuestionOption,
      otherQuestionAnswer,
    ],
  });

  /** 日本語名: 保存済みのフェーズ横断セッション状態を復元する処理。 */
  function restoreSession(parsed: StoredSession | null) {
    if (!parsed) return;

    const restoredSessionState = restoreStoredSessionState(parsed);

    changeConsultation(parsed.request.consultation);
    changeFacts(parsed.request.facts ?? "");
    changeValues(parsed.request.values ?? "");
    changeConcerns(parsed.request.concerns ?? "");
    changeExpectedOutcome(parsed.request.expectedOutcome ?? "");
    setSessionState(restoredSessionState);
    const restoredExperts =
      parsed.confirmedExperts ?? parsed.response?.expert_requests ?? [];
    restoreSelection({
      initialCandidates: getInitialExpertRequests(
        parsed.initialExpertRequests,
        restoredSessionState.currentPhase,
        restoredSessionState.response,
      ),
      confirmedCandidates: restoredExperts,
      comments: parsed.expertComments ?? [],
      drafts: parsed.expertDrafts,
      restoredDraftProvenanceKey: parsed.expertDraftProvenanceKey,
    });
    const restoredCandidates =
      restoredSessionState.response?.expert_requests ?? [];
    synchronizeCandidates(
      restoredCandidates,
      JSON.stringify(restoredCandidates),
    );
    shouldSkipRestoredCandidateSyncRef.current = true;
    groupChatPhase.restore({
      messages: parsed.groupChatMessages ?? [],
      turn: parsed.groupChatTurn ?? null,
      contextSummary: parsed.groupChatContextSummary ?? "",
      expertRepliesSinceUser: parsed.groupChatExpertRepliesSinceUser ?? 0,
      isNextTurnRetryPending: parsed.groupChatNextTurnRetryPending ?? false,
    });
    finalMemoPhase.restore(parsed.finalMarkdown ?? "");
    restoreQuestionAnswer(parsed.request.userQuestionAnswer, parsed.response);
  }

  useEffect(() => {
    if (!hasRestoredSession) return;
    if (shouldSkipRestoredCandidateSyncRef.current) {
      shouldSkipRestoredCandidateSyncRef.current = false;
      return;
    }
    synchronizeCandidates(response?.expert_requests ?? [], expertRequestKey);
  }, [hasRestoredSession, expertRequestKey]);

  const memo = useMemo<SessionMemo | null>(
    () => getCurrentSessionMemo(sessionState),
    [sessionState],
  );
  const sessionConsultation = getSessionConsultation(
    startedConsultation,
    consultation,
  );
  const availableReturnPhases = useMemo(
    () => getAvailableReturnPhases(sessionState),
    [sessionState],
  );

  /** 日本語名: 新規相談開始前に横断状態だけを初期化する。 */
  function resetSessionForStart() {
    setSessionState(createInitialSessionState());
    resetSelectionState();
    groupChatPhase.reset();
    deliberationFlow.clearFailure();
    finalMemoPhase.clear();
  }

  /** 日本語名: 相談開始成功後の横断状態を確定する。 */
  function applyStartedSession(
    request: ConsultationStartRequest,
    facilitatorResponse: FacilitatorResponse,
  ) {
    const nextPhase = getFacilitatorResponsePhase(facilitatorResponse);
    setSessionState(startSession(request, facilitatorResponse, nextPhase));
    changeConsultation(request.consultation);
    changeFacts(request.facts ?? "");
    changeValues(request.values ?? "");
    changeConcerns(request.concerns ?? "");
    changeExpectedOutcome(request.expectedOutcome ?? "");
    clearQuestionAnswer();
    setInitialCandidates(
      nextPhase === "expert_selection"
        ? facilitatorResponse.expert_requests
        : [],
    );
  }

  /** 日本語名: 前提整理回答成功後の横断状態を確定する。 */
  function applyPremiseResponse(facilitatorResponse: FacilitatorResponse) {
    const nextPhase = getFacilitatorResponsePhase(facilitatorResponse);
    setSessionState((state) =>
      applyPremiseSessionResponse(state, facilitatorResponse, nextPhase),
    );
    clearQuestionAnswer();
    setInitialCandidates(
      nextPhase === "expert_selection"
        ? facilitatorResponse.expert_requests
        : [],
    );
  }

  function getPendingRequiredQuestionMessage() {
    if (!response?.user_question?.required) return "";

    return getPremiseAnswer(response)
      ? "質問への回答をファシリテーターに送信してから進めてください。"
      : "先に質問へ回答してください。";
  }

  function clearSession() {
    if (
      isLoading ||
      isGeneratingExperts ||
      isGroupChatBusy ||
      isGeneratingFinalMarkdown
    )
      return;

    hideMemoUpdatedNotice();
    window.localStorage.removeItem(storageKey);
    changeConsultation("");
    changeFacts("");
    changeValues("");
    changeConcerns("");
    changeExpectedOutcome("");
    setSessionState(createInitialSessionState());
    facilitatorFlow.clearFailure();
    clearQuestionAnswer();
    resetSelectionState();
    groupChatPhase.reset();
    deliberationFlow.clearFailure();
    finalMemoPhase.clear();
  }

  function returnToPhase(targetPhase: Phase) {
    if (
      isLoading ||
      isGeneratingExperts ||
      isGroupChatBusy ||
      isGeneratingFinalMarkdown
    )
      return;

    const confirmed = window.confirm(
      "このフェーズに戻ると、以降の整理内容と生成結果は破棄されます。戻りますか？",
    );

    if (!confirmed) return;

    if (targetPhase !== "group_chat") {
      hideMemoUpdatedNotice();
    }

    const returnedSessionState = returnSessionToPhase(
      sessionState,
      targetPhase,
    );
    const shouldKeepExpertDrafts =
      targetPhase === "expert_selection" ||
      targetPhase === "deliberation" ||
      targetPhase === "group_chat" ||
      targetPhase === "final_memo";

    setSessionState(returnedSessionState);
    facilitatorFlow.clearFailure();
    clearQuestionAnswer();
    restoreForPhase({
      initialCandidates:
        targetPhase === "expert_selection" ? initialExpertRequests : [],
      confirmedCandidates: getConfirmedExpertsForReturn(
        targetPhase,
        confirmedExperts,
      ),
      comments: getExpertCommentsForReturn(targetPhase, expertComments),
      drafts: shouldKeepExpertDrafts ? expertDrafts : undefined,
      draftProvenanceKey: shouldKeepExpertDrafts
        ? expertDraftProvenanceKey
        : undefined,
    });
    if (targetPhase !== "group_chat") {
      groupChatPhase.reset();
    }
    deliberationFlow.clearFailure();
    finalMemoPhase.clear();
  }

  function proceedToExpertSelection() {
    if (
      isLoading ||
      isGeneratingExperts ||
      isGeneratingFinalMarkdown ||
      !response ||
      !canProceedToExpertSelection(response)
    ) {
      return;
    }

    setInitialCandidates(response.expert_requests);
    setSessionState(proceedSessionToExpertSelection);
  }

  /** 初回専門家コメントを反映したメモと検討フェーズを同時に確定する。 */
  function settleExpertCommentsMemo(updatedMemo: SessionMemo) {
    setSessionState((state) => settleExpertComments(state, updatedMemo));
  }

  /** 日本語名: 意見交換開始成功後の横断フェーズ状態を確定する。 */
  function settleGroupChatStart(turn: FacilitatorTurn) {
    setSessionState((state) => settleSessionGroupChatStart(state, turn));
    if (turn.memoUpdate) showMemoUpdatedNotice();
  }

  /** ファシリテーターターンが返すメモ更新を現在の履歴へ反映する。 */
  function applyGroupChatTurnUpdate(turn: FacilitatorTurn) {
    const memoUpdate = turn.memoUpdate;
    if (!memoUpdate) return;
    setSessionState((state) => applyGroupChatMemoUpdate(state, memoUpdate));
    showMemoUpdatedNotice();
  }

  /** グループチャット中のメモ更新を短時間だけ通知する。 */
  function showMemoUpdatedNotice() {
    stopMemoUpdatedNoticeTimer();
    setIsMemoUpdateNoticeVisible(true);
    memoUpdateNoticeTimerRef.current = setTimeout(() => {
      setIsMemoUpdateNoticeVisible(false);
      memoUpdateNoticeTimerRef.current = null;
    }, 3000);
  }

  /** 表示中のメモ更新通知を閉じる。 */
  function hideMemoUpdatedNotice() {
    stopMemoUpdatedNoticeTimer();
    setIsMemoUpdateNoticeVisible(false);
  }

  /** メモ更新通知の保留タイマーを停止する。 */
  function stopMemoUpdatedNoticeTimer() {
    if (memoUpdateNoticeTimerRef.current === null) return;
    clearTimeout(memoUpdateNoticeTimerRef.current);
    memoUpdateNoticeTimerRef.current = null;
  }

  /** 日本語名: 終了状態をメモへ反映し、終了メモフェーズへ遷移する。 */
  function settleFinalMemoGeneration(finalMemo: SessionMemo) {
    setSessionState((state) => settleFinalMemo(state, finalMemo));
  }

  /** 日本語名: 終了メモ生成失敗後に意見交換と進行中メモを復元する。 */
  function restoreGroupChatAfterFinalMemoFailure(inProgressMemo: SessionMemo) {
    setSessionState((state) =>
      restoreSessionGroupChatAfterFinalMemoFailure(state, inProgressMemo),
    );
  }

  function buildStoredSession(): StoredSession {
    const request = createSessionRequest({
      consultation,
      facts,
      values,
      concerns,
      expectedOutcome,
      userQuestionAnswer: getPremiseAnswer(response),
      state: sessionState,
    });
    return createStoredSession({
      request,
      state: sessionState,
      expertComments,
      expertDrafts,
      expertDraftProvenanceKey: expertDraftProvenanceKey ?? undefined,
      confirmedExperts,
      groupChatMessages,
      groupChatTurn: groupChatTurn ?? undefined,
      groupChatContextSummary: groupChatContextSummary || undefined,
      groupChatExpertRepliesSinceUser: expertRepliesSinceUser,
      groupChatNextTurnRetryPending: groupChatNextTurnRetryPending || undefined,
      initialExpertRequests,
      finalMarkdown,
    });
  }

  function saveConfirmedExpertDrafts(experts: ExpertRequest[]) {
    facilitatorFlow.clearFailure();
    setSessionState((state) => saveConfirmedExperts(state, experts));
  }

  const phaseContent = createPhaseContent(
    {
      input: {
        consultation,
        facts,
        values,
        concerns,
        expectedOutcome,
        changeConsultation,
        changeFacts,
        changeValues,
        changeConcerns,
        changeExpectedOutcome,
      },
      isBusy:
        isLoading ||
        isGeneratingExperts ||
        isGroupChatBusy ||
        isGeneratingFinalMarkdown,
      hasResponse: Boolean(response),
      errorMessage,
      canRetry: Boolean(failedFacilitatorRequest),
      start: facilitatorFlow.start,
      resetSession: resetSessionForStart,
      applyStartedSession,
      retry: facilitatorFlow.retry,
    },
    {
      response,
      isBusy: isLoading,
      selectedOption: selectedQuestionOption,
      otherAnswer: otherQuestionAnswer,
      errorMessage,
      canRetry: Boolean(failedFacilitatorRequest),
      selectOption: selectQuestionOption,
      changeOtherAnswer: changeOtherQuestionAnswer,
      submitAnswer,
      proceedToExpertSelection,
      retry: facilitatorFlow.retry,
    },
    {
      response,
      expertDrafts,
      confirmedExperts,
      isDisabled: isExpertInteractionDisabled,
      isGenerating: isGeneratingExperts,
      errorMessage: expertErrorMessage,
      updateExpertDraft: updateExpertDraftOperation,
      addExpertDraft: addExpertDraftOperation,
      removeExpertDraft: removeExpertDraftOperation,
      replaceExpertDraft: replaceExpertDraftOperation,
      confirmInitialDrafts: confirmInitialExpertDrafts,
      confirmDrafts: confirmExpertDrafts,
      generateComments: generateExpertComments,
    },
    {
      consultation: sessionConsultation,
      memo,
      confirmedExperts,
      expertComments,
      isStarting: deliberationFlow.isStarting,
      expertErrorMessage,
      startErrorMessage: deliberationFlow.errorMessage,
      start: deliberationFlow.start,
      retryStart: deliberationFlow.retry,
    },
    {
      turn: groupChatTurn,
      messages: groupChatMessages,
      otherAnswer: groupChatOtherAnswer,
      isLoading: isGroupChatBusy,
      isNextTurnRetryPending: groupChatNextTurnRetryPending ?? false,
      errorMessage: groupChatErrorMessage,
      context: {
        consultation: sessionConsultation,
        memo,
        confirmedExperts,
      },
      expertComments,
      contextSummary: groupChatContextSummary,
      finishErrorMessage: finalMarkdownErrorMessage,
      changeOtherAnswer: groupChatPhase.changeOtherAnswer,
      submitUserAnswer: groupChatPhase.submitUserAnswer,
      retryExpertReply: groupChatPhase.retryExpertReply,
      retryNextTurn: groupChatPhase.retryNextTurn,
      finish: finalMemoPhase.finish,
    },
  );

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="現在の進行状況">
        <div>
          <p className="eyebrow">Choice Council</p>
          <h1>複数の視点で、決めきれない相談を整理する</h1>
        </div>
        <div className="phase-pill">{phaseLabels[currentPhase]}</div>
      </section>
      {isMemoUpdateNoticeVisible && (
        <p aria-live="polite" className="notice" role="status">
          メモを更新しました
        </p>
      )}

      <section className="workspace">
        <section className="timeline" aria-label="相談タイムライン">
          <AppPhaseRouter
            currentPhase={currentPhase}
            content={phaseContent}
            response={response}
          />

          <button
            className="mobile-memo-toggle secondary-button"
            type="button"
            aria-controls="session-memo-drawer"
            aria-expanded={isMobileMemoOpen}
            onClick={() => setIsMobileMemoOpen((current) => !current)}
          >
            セッションメモ
          </button>

          {availableReturnPhases.length > 0 && (
            <section className="panel">
              <h2>前フェーズへ戻る</h2>
              <div className="phase-return-list">
                {availableReturnPhases.map((phase) => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={phase}
                    onClick={() => returnToPhase(phase)}
                    disabled={
                      isLoading ||
                      isGeneratingExperts ||
                      isGroupChatBusy ||
                      isGeneratingFinalMarkdown
                    }
                  >
                    {phaseLabels[phase]}へ戻る
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>

        <aside
          id="session-memo-drawer"
          className={`side-panel${isMobileMemoOpen ? " side-panel--mobile-open" : ""}`}
          aria-label="セッションメモ"
        >
          <div className="panel">
            <div className="side-header">
              <h2>セッションメモ</h2>
              <button
                className="text-button danger"
                type="button"
                onClick={clearSession}
                disabled={
                  isLoading ||
                  isGeneratingExperts ||
                  isGroupChatBusy ||
                  isGeneratingFinalMarkdown
                }
              >
                削除
              </button>
            </div>
            <p className="privacy-note">この端末に一時保存されます。</p>
            <div className="memo-actions">
              <FinalMemoPhaseConnection
                isVisible={currentPhase === "final_memo"}
                isGenerating={isGeneratingFinalMarkdown}
                finalMarkdown={finalMarkdown}
                download={finalMemoPhase.download}
              />
            </div>
            {memo ? (
              <MemoView memo={memo} />
            ) : (
              <p className="empty">
                相談を開始すると、前提や未確認事項をここに整理します。
              </p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
