import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConsultationStartRequest,
  ConsultationRequest,
  ExpertComment,
  ExpertRequest,
  FacilitatorTurn,
  FacilitatorResponse,
  Phase,
  SessionMemo,
  GroupChatMessage,
} from "../shared/schemas/session";
import { getRecentGroupChatMessages } from "./group-chat-context";
import {
  canProceedToExpertSelection,
  getFacilitatorResponsePhase,
  getInitialExpertRequests,
  getSessionConsultation,
  isExpertDraftEditingDisabled,
} from "./facilitator-flow";
import {
  clearResponseHistory,
  createResponseForPhase,
  createResponseHistoryForNewConsultation,
  getConfirmedExpertsForReturn,
  getExpertCommentsForReturn,
  getReturnablePhases,
  keepResponsesThroughPhase,
  phaseOrder,
  type ResponseHistory,
} from "./phase-history";
import { useGroupChatPhase } from "./hooks/use-group-chat-phase";
import { usePremisePhase } from "./hooks/use-premise-phase";
import { useConsultationPhase } from "./hooks/use-consultation-phase";
import { useFinalMemoPhase } from "./hooks/use-final-memo-phase";
import { useFacilitatorPhaseFlow } from "./hooks/use-facilitator-phase-flow";
import {
  type ExpertDraft,
  useExpertSelectionPhase,
} from "./hooks/use-expert-selection-phase";
import { useSessionPersistence } from "./hooks/use-session-persistence";
import { useDeliberationPhaseFlow } from "./hooks/use-deliberation-phase-flow";
import { recoverInterruptedFinalMemo } from "./final-memo-restoration";
import { restoreSessionPhase } from "./session-phase-restoration";
import { ConsultationInputPhase } from "./phases/ConsultationInputPhase";
import { DeliberationPhase } from "./phases/DeliberationPhase";
import { ExpertSelectionPhase } from "./phases/ExpertSelectionPhase";
import { FinalMemoPhase } from "./phases/FinalMemoPhase";
import { GroupChatPhase } from "./phases/GroupChatPhase";
import { AppPhaseRouter } from "./phases/AppPhaseRouter";
import { PremisePhase } from "./phases/PremisePhase";
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

const nextActionLabels: Record<FacilitatorResponse["next_action"], string> = {
  wait_user: "ユーザー回答待ち",
  request_experts: "専門家コメント生成候補",
  update_memo: "セッションメモ更新候補",
  move_phase: "次フェーズ候補",
  finish: "終了候補",
};

type StoredSession = {
  request: ConsultationRequest;
  startedConsultation?: string;
  response: FacilitatorResponse | null;
  responseHistory?: Partial<Record<Phase, FacilitatorResponse>>;
  currentPhase?: unknown;
  expertComments?: ExpertComment[];
  expertDrafts?: ExpertDraft[];
  expertDraftProvenanceKey?: string;
  initialExpertRequests?: ExpertRequest[];
  confirmedExperts?: ExpertRequest[];
  groupChatMessages?: GroupChatMessage[];
  groupChatTurn?: FacilitatorTurn;
  groupChatContextSummary?: string;
  groupChatExpertRepliesSinceUser?: number;
  finalMarkdown?: string;
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
  const [startedConsultation, setStartedConsultation] = useState("");
  const [response, setResponse] = useState<FacilitatorResponse | null>(null);
  const [responseHistory, setResponseHistory] = useState<ResponseHistory>({});
  const [currentPhase, setCurrentPhase] = useState<Phase>("consultation_input");
  const [isMobileMemoOpen, setIsMobileMemoOpen] = useState(false);
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
    onCommentsGenerated: () => moveResponseToPhase("deliberation"),
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
      initialExpertRequests,
      finalMarkdown,
      selectedQuestionOption,
      otherQuestionAnswer,
    ],
  });

  /** 日本語名: 保存済みのフェーズ横断セッション状態を復元する処理。 */
  function restoreSession(parsed: StoredSession | null) {
    if (!parsed) return;

    const restoredPhase = restoreSessionPhase(
      parsed.currentPhase,
      parsed.response?.current_phase,
    );
    const restoredSession = recoverInterruptedFinalMemo({
      currentPhase: restoredPhase,
      response: parsed.response,
      responseHistory:
        parsed.responseHistory ?? responseToHistory(parsed.response),
      finalMarkdown: parsed.finalMarkdown ?? "",
    });

    changeConsultation(parsed.request.consultation);
    setStartedConsultation(
      parsed.startedConsultation ??
        (parsed.response ? parsed.request.consultation : ""),
    );
    changeFacts(parsed.request.facts ?? "");
    changeValues(parsed.request.values ?? "");
    changeConcerns(parsed.request.concerns ?? "");
    changeExpectedOutcome(parsed.request.expectedOutcome ?? "");
    setResponse(restoredSession.response);
    setResponseHistory(restoredSession.responseHistory);
    setCurrentPhase(restoredSession.currentPhase);
    const restoredExperts =
      parsed.confirmedExperts ?? parsed.response?.expert_requests ?? [];
    restoreSelection({
      initialCandidates: getInitialExpertRequests(
        parsed.initialExpertRequests,
        restoredSession.currentPhase,
        restoredSession.response,
      ),
      confirmedCandidates: restoredExperts,
      comments: parsed.expertComments ?? [],
      drafts: parsed.expertDrafts,
      restoredDraftProvenanceKey: parsed.expertDraftProvenanceKey,
    });
    const restoredCandidates = restoredSession.response?.expert_requests ?? [];
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

  const memo = useMemo<SessionMemo | null>(() => {
    return (
      response?.memo_updates ??
      getLatestMemoBeforePhase(responseHistory, currentPhase)
    );
  }, [response, responseHistory, currentPhase]);
  const sessionConsultation = getSessionConsultation(
    startedConsultation,
    consultation,
  );
  const availableReturnPhases = useMemo(() => {
    return getReturnablePhases(currentPhase, responseHistory);
  }, [currentPhase, responseHistory]);

  /** 日本語名: 新規相談開始前に横断状態だけを初期化する。 */
  function resetSessionForStart() {
    setStartedConsultation("");
    setResponse(null);
    setResponseHistory(clearResponseHistory());
    setCurrentPhase("consultation_input");
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
    const nextResponse = createResponseForPhase(facilitatorResponse, nextPhase);
    setCurrentPhase(nextPhase);
    setResponse(nextResponse);
    setStartedConsultation(request.consultation);
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
    setResponseHistory(
      createResponseHistoryForNewConsultation(
        facilitatorResponse,
        nextResponse,
        nextPhase,
      ),
    );
  }

  /** 日本語名: 前提整理回答成功後の横断状態を確定する。 */
  function applyPremiseResponse(facilitatorResponse: FacilitatorResponse) {
    const nextPhase = getFacilitatorResponsePhase(facilitatorResponse);
    const nextResponse = createResponseForPhase(facilitatorResponse, nextPhase);
    setCurrentPhase(nextPhase);
    setResponse(nextResponse);
    setResponseHistory((current) => ({
      ...current,
      premise: facilitatorResponse,
      ...(nextPhase === "expert_selection"
        ? { expert_selection: nextResponse }
        : {}),
    }));
    clearQuestionAnswer();
    setInitialCandidates(
      nextPhase === "expert_selection"
        ? facilitatorResponse.expert_requests
        : [],
    );
  }

  /** 日本語名: クライアント内で保持する相談文脈を作成する関数。 */
  function buildRequest(): ConsultationRequest {
    return {
      consultation,
      facts: emptyToUndefined(facts),
      values: emptyToUndefined(values),
      concerns: emptyToUndefined(concerns),
      expectedOutcome: emptyToUndefined(expectedOutcome),
      userQuestion: response?.user_question ?? undefined,
      userQuestionAnswer: getPremiseAnswer(response),
      currentPhase,
      memo:
        response?.memo_updates ??
        getLatestMemoBeforePhase(responseHistory, currentPhase) ??
        undefined,
    };
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

    window.localStorage.removeItem(storageKey);
    changeConsultation("");
    setStartedConsultation("");
    changeFacts("");
    changeValues("");
    changeConcerns("");
    changeExpectedOutcome("");
    setResponse(null);
    setResponseHistory({});
    setCurrentPhase("consultation_input");
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

    const nextResponseHistory =
      targetPhase === "consultation_input"
        ? clearResponseHistory()
        : keepResponsesThroughPhase(responseHistory, targetPhase);

    setCurrentPhase(targetPhase);
    setResponse(nextResponseHistory[targetPhase] ?? null);
    setResponseHistory(nextResponseHistory);
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
      drafts: targetPhase === "expert_selection" ? expertDrafts : undefined,
      draftProvenanceKey:
        targetPhase === "expert_selection"
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

    const nextResponse = createResponseForPhase(response, "expert_selection");

    setInitialCandidates(response.expert_requests);
    setCurrentPhase("expert_selection");
    setResponse(nextResponse);
    setResponseHistory((current) => ({
      ...keepResponsesThroughPhase(current, "premise"),
      premise: current.premise ?? response,
      expert_selection: nextResponse,
    }));
  }

  /** 日本語名: 意見交換開始成功後の横断フェーズ状態を確定する。 */
  function settleGroupChatStart(turn: FacilitatorTurn) {
    setCurrentPhase("group_chat");
    setResponse((currentResponse) => {
      if (!currentResponse) return currentResponse;

      const nextResponse = createResponseForPhase(
        currentResponse,
        "group_chat",
      );
      const responseWithMemo = turn.memoUpdate
        ? { ...nextResponse, memo_updates: turn.memoUpdate }
        : nextResponse;
      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, currentPhase),
        group_chat: responseWithMemo,
      }));
      return responseWithMemo;
    });
  }

  /** ファシリテーターターンが返すメモ更新を現在の履歴へ反映する。 */
  function applyGroupChatTurnUpdate(turn: FacilitatorTurn) {
    const memoUpdate = turn.memoUpdate;
    if (!memoUpdate) return;
    setResponse((currentResponse) =>
      currentResponse ? { ...currentResponse, memo_updates: memoUpdate } : null,
    );
    setResponseHistory((current) => {
      const currentResponse = current.group_chat;
      return currentResponse
        ? {
            ...current,
            group_chat: { ...currentResponse, memo_updates: memoUpdate },
          }
        : current;
    });
  }

  /** 日本語名: 終了状態をメモへ反映し、終了メモフェーズへ遷移する。 */
  function settleFinalMemoGeneration(finalMemo: SessionMemo) {
    setCurrentPhase("final_memo");
    setResponse((currentResponse) => {
      if (!currentResponse) return currentResponse;

      const groupChatResponse = {
        ...currentResponse,
        memo_updates: finalMemo,
      };
      const finalMemoResponse = createResponseForPhase(
        groupChatResponse,
        "final_memo",
      );
      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, "group_chat"),
        group_chat: groupChatResponse,
        final_memo: finalMemoResponse,
      }));
      return finalMemoResponse;
    });
  }

  /** 日本語名: 終了メモ生成失敗後に意見交換と進行中メモを復元する。 */
  function restoreGroupChatAfterFinalMemoFailure(inProgressMemo: SessionMemo) {
    setCurrentPhase("group_chat");
    setResponse((currentResponse) => {
      if (!currentResponse) return currentResponse;

      const groupChatResponse = {
        ...createResponseForPhase(currentResponse, "group_chat"),
        memo_updates: inProgressMemo,
      };
      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, "group_chat"),
        group_chat: groupChatResponse,
      }));
      return groupChatResponse;
    });
  }

  function buildStoredSession(): StoredSession {
    const request = {
      ...buildRequest(),
      userQuestion: response?.user_question ?? undefined,
      userQuestionAnswer: getPremiseAnswer(response),
    };
    return {
      request,
      startedConsultation: startedConsultation || undefined,
      response,
      responseHistory,
      currentPhase,
      expertComments,
      expertDrafts,
      expertDraftProvenanceKey: expertDraftProvenanceKey ?? undefined,
      confirmedExperts,
      groupChatMessages,
      groupChatTurn: groupChatTurn ?? undefined,
      groupChatContextSummary: groupChatContextSummary || undefined,
      groupChatExpertRepliesSinceUser: expertRepliesSinceUser,
      initialExpertRequests,
      finalMarkdown: finalMarkdown || undefined,
    };
  }

  function moveResponseToPhase(nextPhase: Phase) {
    setCurrentPhase(nextPhase);
    setResponse((currentResponse) => {
      if (!currentResponse) return currentResponse;

      const nextResponse = createResponseForPhase(currentResponse, nextPhase);

      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, currentPhase),
        [nextPhase]: nextResponse,
      }));

      return nextResponse;
    });
  }

  function saveConfirmedExpertDrafts(experts: ExpertRequest[]) {
    const nextPhase =
      currentPhase === "premise" ? "expert_selection" : currentPhase;

    facilitatorFlow.clearFailure();
    setCurrentPhase(nextPhase);
    setResponse((currentResponse) => {
      if (!currentResponse) return currentResponse;

      const nextResponse = createResponseForPhase(
        currentResponse,
        nextPhase,
        experts,
      );

      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, currentPhase),
        [nextPhase]: nextResponse,
      }));

      return nextResponse;
    });
  }

  const phaseContent: Record<Phase, React.ReactNode> = {
    consultation_input: (
      <ConsultationInputPhase
        consultation={consultation}
        facts={facts}
        values={values}
        concerns={concerns}
        expectedOutcome={expectedOutcome}
        isBusy={
          isLoading ||
          isGeneratingExperts ||
          isGroupChatBusy ||
          isGeneratingFinalMarkdown
        }
        hasResponse={Boolean(response)}
        errorMessage={errorMessage}
        canRetry={Boolean(failedFacilitatorRequest)}
        onConsultationChange={changeConsultation}
        onFactsChange={changeFacts}
        onValuesChange={changeValues}
        onConcernsChange={changeConcerns}
        onExpectedOutcomeChange={changeExpectedOutcome}
        onStart={() =>
          void facilitatorFlow.start({
            input: { consultation, facts, values, concerns, expectedOutcome },
            onBeforeRequest: resetSessionForStart,
            onSuccess: applyStartedSession,
          })
        }
        onRetry={() => void facilitatorFlow.retry()}
      />
    ),
    premise: (
      <PremisePhase
        canProceed={Boolean(response && canProceedToExpertSelection(response))}
        isBusy={isLoading}
        onProceed={proceedToExpertSelection}
        question={response?.user_question}
        selectedOption={selectedQuestionOption}
        otherAnswer={otherQuestionAnswer}
        onSelectOption={selectQuestionOption}
        onOtherAnswerChange={changeOtherQuestionAnswer}
        onSubmitAnswer={() => void submitAnswer()}
        errorMessage={errorMessage}
        canRetry={Boolean(failedFacilitatorRequest)}
        onRetry={() => void facilitatorFlow.retry()}
      />
    ),
    expert_selection:
      response && response.expert_requests.length > 0 ? (
        <ExpertSelectionPhase
          expertDrafts={expertDrafts}
          confirmedExperts={confirmedExperts}
          isDisabled={isExpertInteractionDisabled}
          isGenerating={isGeneratingExperts}
          errorMessage={expertErrorMessage}
          onUpdate={updateExpertDraftOperation}
          onAdd={addExpertDraftOperation}
          onRemove={removeExpertDraftOperation}
          onReplace={replaceExpertDraftOperation}
          onConfirmInitial={confirmInitialExpertDrafts}
          onConfirm={confirmExpertDrafts}
          onGenerate={() => void generateExpertComments()}
        />
      ) : null,
    deliberation: (
      <DeliberationPhase
        expertComments={expertComments}
        isStarting={deliberationFlow.isStarting}
        errorMessage={expertErrorMessage}
        startErrorMessage={deliberationFlow.errorMessage}
        onStart={() =>
          void deliberationFlow.start({
            consultation: sessionConsultation,
            memo,
            confirmedExperts,
            expertComments,
          })
        }
        onRetryStart={() => void deliberationFlow.retry()}
      />
    ),
    group_chat: (
      <GroupChatPhase
        turn={groupChatTurn}
        messages={groupChatMessages}
        otherAnswer={groupChatOtherAnswer}
        isLoading={isGroupChatBusy}
        errorMessage={groupChatErrorMessage}
        onOtherAnswerChange={groupChatPhase.changeOtherAnswer}
        onUserAnswer={(answer) =>
          void groupChatPhase.submitUserAnswer({
            answer,
            consultation: sessionConsultation,
            memo,
            confirmedExperts,
          })
        }
        onRetryExpertReply={() =>
          void groupChatPhase.retryExpertReply({
            consultation: sessionConsultation,
            memo,
            confirmedExperts,
          })
        }
        finishErrorMessage={finalMarkdownErrorMessage}
        onFinish={(status) =>
          void finalMemoPhase.finish({
            consultation: sessionConsultation,
            memo,
            status,
            expertComments,
            contextSummary: groupChatContextSummary,
            recentMessages: getRecentGroupChatMessages(groupChatMessages),
          })
        }
      />
    ),
    final_memo: null,
  };

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="現在の進行状況">
        <div>
          <p className="eyebrow">Choice Council</p>
          <h1>複数の視点で、決めきれない相談を整理する</h1>
        </div>
        <div className="phase-pill">{phaseLabels[currentPhase]}</div>
      </section>

      <section className="workspace">
        <section className="timeline" aria-label="相談タイムライン">
          <AppPhaseRouter
            currentPhase={currentPhase}
            content={phaseContent}
            renderResponse={(phaseContent) =>
              response && (
                <article className="message-card">
                  <div className="message-label">ファシリテーター</div>
                  <p>{response.facilitator_message}</p>
                  <p className="next-action">
                    候補行動: {nextActionLabels[response.next_action]}
                  </p>
                  {phaseContent}
                </article>
              )
            }
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
              {currentPhase === "final_memo" && (
                <FinalMemoPhase
                  isGenerating={isGeneratingFinalMarkdown}
                  finalMarkdown={finalMarkdown}
                  onDownload={finalMemoPhase.download}
                />
              )}
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

function responseToHistory(response: FacilitatorResponse | null) {
  return response ? { [response.current_phase]: response } : {};
}

function getLatestMemoBeforePhase(
  responseHistory: Partial<Record<Phase, FacilitatorResponse>>,
  targetPhase: Phase,
) {
  const targetIndex = phaseOrder.indexOf(targetPhase);

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const phase = phaseOrder[index];
    const memo = responseHistory[phase]?.memo_updates;
    if (memo) return memo;
  }

  return null;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
