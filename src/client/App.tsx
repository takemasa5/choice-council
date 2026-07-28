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
  SessionMemoRequest,
  GroupChatMessage,
} from "../shared/schemas/session";
import { SessionMemoSchema } from "../shared/schemas/session";
import { getRecentGroupChatMessages } from "./group-chat-context";
import {
  buildInterruptionMemoUpdateRequest,
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
import { useExpertSelectionPhase } from "./hooks/use-expert-selection-phase";
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

const interruptionOptions = [
  "前提を修正したい",
  "この論点を深掘りしたい",
  "外部情報を調べたい",
  "別の選択肢を追加したい",
  "いったんまとめたい",
  "その他",
];

type StoredSession = {
  request: ConsultationRequest;
  startedConsultation?: string;
  response: FacilitatorResponse | null;
  responseHistory?: Partial<Record<Phase, FacilitatorResponse>>;
  currentPhase?: unknown;
  expertComments?: ExpertComment[];
  initialExpertRequests?: ExpertRequest[];
  confirmedExperts?: ExpertRequest[];
  groupChatMessages?: GroupChatMessage[];
  groupChatTurn?: FacilitatorTurn;
  groupChatContextSummary?: string;
  groupChatExpertRepliesSinceUser?: number;
  finalMarkdown?: string;
  interruption?: {
    isReady: boolean;
    selectedOption: string;
    otherAnswer: string;
  };
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
  const facilitatorFlow = useFacilitatorPhaseFlow();
  const {
    isLoading,
    errorMessage,
    failedRequest: failedFacilitatorRequest,
  } = facilitatorFlow;
  const [pauseRequested, setPauseRequested] = useState(false);
  const pauseRequestedRef = useRef(false);
  const [isInterruptionReady, setIsInterruptionReady] = useState(false);
  const [selectedInterruptionOption, setSelectedInterruptionOption] =
    useState("");
  const [interruptionOtherAnswer, setInterruptionOtherAnswer] = useState("");
  const [isUpdatingInterruptionMemo, setIsUpdatingInterruptionMemo] =
    useState(false);
  const [interruptionMemoErrorMessage, setInterruptionMemoErrorMessage] =
    useState("");
  const [memoNotice, setMemoNotice] = useState("");
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
    shouldPause: () => pauseRequestedRef.current,
    onFinished: showInterruptionOptionsIfPaused,
  });
  const {
    state: groupChat,
    isLoading: isStartingGroupChat,
    errorMessage: groupChatErrorMessage,
  } = groupChatPhase;
  const deliberationFlow = useDeliberationPhaseFlow({
    onReset: groupChatPhase.reset,
    onStarted: (request, turn) => groupChatPhase.begin({ request, turn }),
    onFinished: showInterruptionOptionsIfPaused,
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
  const canRequestPause = isLoading || isGeneratingExperts || isGroupChatBusy;
  const isExpertInteractionDisabled =
    isExpertDraftEditingDisabled(isGeneratingExperts) ||
    isGroupChatBusy ||
    isUpdatingInterruptionMemo;
  const expertRequestKey = useMemo(() => {
    return JSON.stringify(response?.expert_requests ?? []);
  }, [response?.expert_requests]);

  useSessionPersistence<StoredSession>({
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
      confirmedExperts,
      groupChatMessages,
      groupChatTurn,
      groupChatContextSummary,
      expertRepliesSinceUser,
      initialExpertRequests,
      finalMarkdown,
      selectedQuestionOption,
      otherQuestionAnswer,
      selectedInterruptionOption,
      interruptionOtherAnswer,
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
    });
    groupChatPhase.restore({
      messages: parsed.groupChatMessages ?? [],
      turn: parsed.groupChatTurn ?? null,
      contextSummary: parsed.groupChatContextSummary ?? "",
      expertRepliesSinceUser: parsed.groupChatExpertRepliesSinceUser ?? 0,
    });
    finalMemoPhase.restore(parsed.finalMarkdown ?? "");
    restoreQuestionAnswer(parsed.request.userQuestionAnswer, parsed.response);
    restoreInterruption(parsed.interruption);
  }

  useEffect(() => {
    synchronizeCandidates(response?.expert_requests ?? [], expertRequestKey);
  }, [expertRequestKey]);

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
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setMemoNotice("");
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
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
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
    showInterruptionOptionsIfPaused();
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
    showInterruptionOptionsIfPaused();
  }

  /** 日本語名: クライアント内で保持する相談文脈を作成する関数。 */
  function buildRequest(): ConsultationRequest {
    return {
      consultation,
      facts: emptyToUndefined(facts),
      values: emptyToUndefined(values),
      concerns: emptyToUndefined(concerns),
      expectedOutcome: emptyToUndefined(expectedOutcome),
      userQuestion: getActiveUserQuestion(),
      userQuestionAnswer: getUserQuestionAnswer(),
      currentPhase,
      memo:
        response?.memo_updates ??
        getLatestMemoBeforePhase(responseHistory, currentPhase) ??
        undefined,
    };
  }

  function getUserQuestionAnswer() {
    if (selectedInterruptionOption && selectedInterruptionOption !== "その他") {
      return selectedInterruptionOption;
    }

    return getPremiseAnswer(response);
  }

  function getActiveUserQuestion() {
    if (selectedInterruptionOption && selectedInterruptionOption !== "その他") {
      return {
        question: "割り込み後にどこから調整しますか？",
        options: interruptionOptions,
        required: false,
      };
    }

    return response?.user_question ?? undefined;
  }

  function getPendingRequiredQuestionMessage() {
    if (!response?.user_question?.required) return "";

    return getUserQuestionAnswer()
      ? "質問への回答をファシリテーターに送信してから進めてください。"
      : "先に質問へ回答してください。";
  }

  function restoreInterruption(interruption: StoredSession["interruption"]) {
    if (!interruption) return;

    setIsInterruptionReady(interruption.isReady);
    setSelectedInterruptionOption(interruption.selectedOption);
    setInterruptionOtherAnswer(interruption.otherAnswer);
  }

  function clearSession() {
    if (
      isLoading ||
      isGeneratingExperts ||
      isGroupChatBusy ||
      isGeneratingFinalMarkdown ||
      isUpdatingInterruptionMemo
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
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
    setMemoNotice("");
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
      isGeneratingFinalMarkdown ||
      isUpdatingInterruptionMemo
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
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
    setMemoNotice("");
    clearQuestionAnswer();
    restoreForPhase({
      initialCandidates:
        targetPhase === "expert_selection" ? initialExpertRequests : [],
      confirmedCandidates: getConfirmedExpertsForReturn(
        targetPhase,
        confirmedExperts,
      ),
      comments: getExpertCommentsForReturn(targetPhase, expertComments),
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
      isUpdatingInterruptionMemo ||
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

  function requestPause() {
    if (!canRequestPause) return;

    pauseRequestedRef.current = true;
    setPauseRequested(true);
  }

  function showInterruptionOptionsIfPaused() {
    if (!pauseRequestedRef.current) return;

    setIsInterruptionReady(true);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
  }

  function chooseInterruptionOption(option: string) {
    setSelectedInterruptionOption(option);
    if (option !== "その他") setInterruptionOtherAnswer("");
    setInterruptionMemoErrorMessage("");
  }

  /**
   * 割り込みで選んだ調整方針を、ユーザー操作としてセッションメモへ記録する。
   *
   * 仕様対応: `docs/api/schemas.md#セッションメモ`、
   * `docs/design/user-experience.md#「ちょっと待って」ボタン`。
   */
  async function confirmInterruptionOption() {
    if (isUpdatingInterruptionMemo) return;

    const userAction =
      selectedInterruptionOption === "その他"
        ? interruptionOtherAnswer
        : selectedInterruptionOption;
    const request = buildInterruptionMemoUpdateRequest({
      consultation: sessionConsultation,
      currentPhase,
      previousMemo: memo,
      userAction,
    });
    if (!request) {
      setInterruptionMemoErrorMessage(
        "記録する調整方針とセッションメモを確認してください。",
      );
      return;
    }

    setIsUpdatingInterruptionMemo(true);
    setInterruptionMemoErrorMessage("");

    try {
      const updatedMemo = await requestSessionMemoUpdate(request);
      const updatedResponse = response
        ? { ...response, memo_updates: updatedMemo }
        : null;

      setResponse(updatedResponse);
      setResponseHistory((current) => {
        if (!updatedResponse) return current;

        return { ...current, [currentPhase]: updatedResponse };
      });
      facilitatorFlow.synchronizeRetryMemo(updatedMemo);
      setIsInterruptionReady(false);
      setSelectedInterruptionOption("");
      setInterruptionOtherAnswer("");
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      setMemoNotice("メモを更新しました。");
    } catch (error) {
      setInterruptionMemoErrorMessage(
        error instanceof Error ? error.message : "メモの更新に失敗しました。",
      );
    } finally {
      setIsUpdatingInterruptionMemo(false);
    }
  }

  /**
   * セッションメモ更新 API のレスポンスを検証して返す。
   *
   * 仕様対応: `docs/api/schemas.md#セッションメモ`。
   */
  async function requestSessionMemoUpdate(
    request: SessionMemoRequest,
  ): Promise<SessionMemo> {
    const apiResponse = await fetch("/api/session-memo/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body: unknown = await apiResponse.json();

    if (!apiResponse.ok) {
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? body.message
          : undefined;
      throw new Error(
        typeof message === "string" ? message : "メモの更新に失敗しました。",
      );
    }

    const parsedMemo = SessionMemoSchema.safeParse(body);
    if (!parsedMemo.success) {
      throw new Error(
        "メモの更新結果を確認できませんでした。再試行してください。",
      );
    }

    return parsedMemo.data;
  }

  function buildStoredSession(): StoredSession {
    const request = {
      ...buildRequest(),
      userQuestion: response?.user_question ?? undefined,
      userQuestionAnswer: getPremiseAnswer(response),
    };
    const hasInterruptionState =
      isInterruptionReady ||
      Boolean(selectedInterruptionOption) ||
      Boolean(interruptionOtherAnswer);

    return {
      request,
      startedConsultation: startedConsultation || undefined,
      response,
      responseHistory,
      currentPhase,
      expertComments,
      confirmedExperts,
      groupChatMessages,
      groupChatTurn: groupChatTurn ?? undefined,
      groupChatContextSummary: groupChatContextSummary || undefined,
      groupChatExpertRepliesSinceUser: expertRepliesSinceUser,
      initialExpertRequests,
      finalMarkdown: finalMarkdown || undefined,
      interruption: hasInterruptionState
        ? {
            isReady: isInterruptionReady,
            selectedOption: selectedInterruptionOption,
            otherAnswer: interruptionOtherAnswer,
          }
        : undefined,
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
          isGeneratingFinalMarkdown ||
          isUpdatingInterruptionMemo
        }
        hasResponse={Boolean(response)}
        canRequestPause={canRequestPause}
        pauseRequested={pauseRequested}
        errorMessage={errorMessage}
        canRetry={Boolean(failedFacilitatorRequest)}
        onConsultationChange={changeConsultation}
        onFactsChange={changeFacts}
        onValuesChange={changeValues}
        onConcernsChange={changeConcerns}
        onExpectedOutcomeChange={changeExpectedOutcome}
        onStart={() => {
          if (isUpdatingInterruptionMemo) return;
          void facilitatorFlow.start({
            input: { consultation, facts, values, concerns, expectedOutcome },
            onBeforeRequest: resetSessionForStart,
            onSuccess: applyStartedSession,
          });
        }}
        onRequestPause={requestPause}
        onRetry={() => void facilitatorFlow.retry()}
      />
    ),
    premise: (
      <PremisePhase
        canProceed={Boolean(response && canProceedToExpertSelection(response))}
        isBusy={isLoading || isUpdatingInterruptionMemo}
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
        isLoading={isGroupChatBusy || isUpdatingInterruptionMemo}
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
                  {isInterruptionReady && (
                    <div className="question-box">
                      <strong>どこから調整しますか？</strong>
                      <div className="option-list">
                        {interruptionOptions.map((option) => (
                          <button
                            type="button"
                            key={option}
                            className={
                              selectedInterruptionOption === option
                                ? "selected"
                                : undefined
                            }
                            onClick={() => chooseInterruptionOption(option)}
                            disabled={isUpdatingInterruptionMemo}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      {selectedInterruptionOption === "その他" && (
                        <label className="field inline-field">
                          <span>自由入力</span>
                          <textarea
                            value={interruptionOtherAnswer}
                            onChange={(event) =>
                              setInterruptionOtherAnswer(event.target.value)
                            }
                            rows={3}
                            disabled={isUpdatingInterruptionMemo}
                          />
                        </label>
                      )}
                      {selectedInterruptionOption && (
                        <div className="action-row">
                          <button
                            className="primary-button"
                            type="button"
                            onClick={confirmInterruptionOption}
                            disabled={isUpdatingInterruptionMemo}
                          >
                            {isUpdatingInterruptionMemo
                              ? "メモを更新中..."
                              : interruptionMemoErrorMessage
                                ? "もう一度記録する"
                                : "選択を記録する"}
                          </button>
                        </div>
                      )}
                      {interruptionMemoErrorMessage && (
                        <p className="error">{interruptionMemoErrorMessage}</p>
                      )}
                    </div>
                  )}
                </article>
              )
            }
          />

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
                      isGeneratingFinalMarkdown ||
                      isUpdatingInterruptionMemo
                    }
                  >
                    {phaseLabels[phase]}へ戻る
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>

        <aside className="side-panel" aria-label="セッションメモ">
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
                  isGeneratingFinalMarkdown ||
                  isUpdatingInterruptionMemo
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
            {memoNotice && <p className="notice">{memoNotice}</p>}
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

function MemoView({ memo }: { memo: SessionMemo }) {
  return (
    <div className="memo-list">
      <MemoSection title="相談テーマ" items={memo.theme ? [memo.theme] : []} />
      <MemoSection title="整理した事実" items={memo.facts} />
      <MemoSection title="重視したこと" items={memo.values} />
      <MemoSection title="不安や懸念" items={memo.concerns} />
      <MemoSection title="未確認事項" items={memo.open_questions} />
      <MemoSection title="次アクション候補" items={memo.next_actions} />
    </div>
  );
}

function MemoSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty small">未整理</p>
      )}
    </section>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
