import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConsultationStartRequest,
  ConsultationRequest,
  ExpertComment,
  ExpertCommentRequest,
  ExpertRequest,
  FacilitatorTurn,
  FacilitatorResponse,
  FacilitatorResponseRequest,
  Phase,
  SessionMemo,
  SessionMemoRequest,
  GroupChatMessage,
} from "../shared/schemas/session";
import {
  FacilitatorTurnSchema,
  GroupChatMessageSchema,
  SessionMemoSchema,
} from "../shared/schemas/session";
import {
  buildConsultationStartRequest,
  buildFacilitatorResponseRequest,
  buildInterruptionMemoUpdateRequest,
  canProceedToExpertSelection,
  collectExpertCommentGenerationResults,
  confirmExpertDrafts as getExpertDraftConfirmation,
  createFailedFacilitatorRequest,
  getFacilitatorResponsePhase,
  getInitialExpertRequests,
  getSessionConsultation,
  isExpertDraftEditingDisabled,
  replaceMemoInFailedFacilitatorRequest,
} from "./facilitator-flow";
import {
  clearResponseHistory,
  createResponseForPhase,
  createResponseHistoryForNewConsultation,
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
import { useFacilitatorRequest } from "./hooks/use-facilitator-request";
import { useExpertSelectionPhase } from "./hooks/use-expert-selection-phase";
import { useSessionPersistence } from "./hooks/use-session-persistence";
import { ConsultationInputPhase } from "./phases/ConsultationInputPhase";
import { DeliberationPhase } from "./phases/DeliberationPhase";
import { ExpertSelectionPhase } from "./phases/ExpertSelectionPhase";
import { FinalMemoPhase } from "./phases/FinalMemoPhase";
import { GroupChatPhase } from "./phases/GroupChatPhase";
import { PremisePhase } from "./phases/PremisePhase";
import { PhaseContent } from "./phases/PhaseContent";
import "./styles.css";

const storageKey = "choice-council-session";
const invalidGenerationMessage =
  "この発言の生成に失敗しました。再生成できます。";
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
  currentPhase: Phase;
  expertComments?: ExpertComment[];
  initialExpertRequests?: ExpertRequest[];
  confirmedExperts?: ExpertRequest[];
  groupChatMessages?: GroupChatMessage[];
  groupChatTurn?: FacilitatorTurn;
  groupChatContextSummary?: string;
  finalMarkdown?: string;
  interruption?: {
    isReady: boolean;
    selectedOption: string;
    otherAnswer: string;
  };
};

/** 日本語名: フェーズ横断のセッション状態とアプリケーションシェルを管理するコンポーネント。 */
export function App() {
  const finalMemoPhase = useFinalMemoPhase();
  const {
    consultation,
    setConsultation,
    facts,
    setFacts,
    values,
    setValues,
    concerns,
    setConcerns,
    expectedOutcome,
    setExpectedOutcome,
  } = useConsultationPhase();
  const [startedConsultation, setStartedConsultation] = useState("");
  const [response, setResponse] = useState<FacilitatorResponse | null>(null);
  const [responseHistory, setResponseHistory] = useState<ResponseHistory>({});
  const [currentPhase, setCurrentPhase] = useState<Phase>("consultation_input");
  const {
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    failedRequest: failedFacilitatorRequest,
    setFailedRequest: setFailedFacilitatorRequest,
    post: postFacilitatorRequest,
    retry: retryFacilitatorRequest,
  } = useFacilitatorRequest();
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
    setSelectedQuestionOption,
    otherQuestionAnswer,
    setOtherQuestionAnswer,
    getAnswer: getPremiseAnswer,
  } = usePremisePhase();
  const {
    expertDrafts,
    setExpertDrafts,
    initialExpertRequests,
    setInitialExpertRequests,
    confirmedExperts,
    setConfirmedExperts,
    expertComments,
    setExpertComments,
    isGenerating: isGeneratingExperts,
    setIsGenerating: setIsGeneratingExperts,
    errorMessage: expertErrorMessage,
    setErrorMessage: setExpertErrorMessage,
    confirmedRequestKeyRef: confirmedExpertRequestKeyRef,
    createDraft: createExpertDraft,
    requestComment,
    updateExpertDraft: updateExpertDraftOperation,
    addExpertDraft: addExpertDraftOperation,
    removeExpertDraft: removeExpertDraftOperation,
    replaceExpertDraft: replaceExpertDraftOperation,
  } = useExpertSelectionPhase();
  const {
    state: groupChat,
    dispatch: dispatchGroupChat,
    isLoading: isStartingGroupChat,
    setIsLoading: setIsStartingGroupChat,
    errorMessage: groupChatErrorMessage,
    setErrorMessage: setGroupChatErrorMessage,
    createFacilitatorMessage,
    createUserMessage,
    postJson: postGroupChatJson,
  } = useGroupChatPhase();
  const {
    messages: groupChatMessages,
    turn: groupChatTurn,
    contextSummary: groupChatContextSummary,
    otherAnswer: groupChatOtherAnswer,
    expertRepliesSinceUser,
  } = groupChat;
  const {
    finalMarkdown,
    setFinalMarkdown,
    isGenerating: isGeneratingFinalMarkdown,
    errorMessage: finalMarkdownErrorMessage,
    setErrorMessage: setFinalMarkdownErrorMessage,
  } = finalMemoPhase;
  const canRequestPause =
    isLoading || isGeneratingExperts || isStartingGroupChat;
  const isExpertInteractionDisabled =
    isExpertDraftEditingDisabled(isGeneratingExperts) ||
    isStartingGroupChat ||
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

    setConsultation(parsed.request.consultation);
    setStartedConsultation(
      parsed.startedConsultation ??
        (parsed.response ? parsed.request.consultation : ""),
    );
    setFacts(parsed.request.facts ?? "");
    setValues(parsed.request.values ?? "");
    setConcerns(parsed.request.concerns ?? "");
    setExpectedOutcome(parsed.request.expectedOutcome ?? "");
    setResponse(parsed.response);
    setResponseHistory(
      parsed.responseHistory ?? responseToHistory(parsed.response),
    );
    setCurrentPhase(
      parsed.currentPhase ??
        parsed.response?.current_phase ??
        "consultation_input",
    );
    setExpertComments(parsed.expertComments ?? []);
    const restoredExperts =
      parsed.confirmedExperts ?? parsed.response?.expert_requests ?? [];
    confirmedExpertRequestKeyRef.current = JSON.stringify(restoredExperts);
    setConfirmedExperts(restoredExperts);
    dispatchGroupChat({
      type: "restore",
      state: {
        messages: parsed.groupChatMessages ?? [],
        turn: parsed.groupChatTurn ?? null,
        contextSummary: parsed.groupChatContextSummary ?? "",
      },
    });
    const restoredPhase =
      parsed.currentPhase ??
      parsed.response?.current_phase ??
      "consultation_input";
    setInitialExpertRequests(
      getInitialExpertRequests(
        parsed.initialExpertRequests,
        restoredPhase,
        parsed.response,
      ),
    );
    setFinalMarkdown(parsed.finalMarkdown ?? "");
    restoreQuestionAnswer(parsed.request.userQuestionAnswer, parsed.response);
    restoreInterruption(parsed.interruption);
  }

  useEffect(() => {
    setExpertDrafts((response?.expert_requests ?? []).map(createExpertDraft));
    if (confirmedExpertRequestKeyRef.current === expertRequestKey) {
      confirmedExpertRequestKeyRef.current = "";
    } else {
      setConfirmedExperts([]);
    }
    setExpertErrorMessage("");
  }, [expertRequestKey]);

  const memo = useMemo<SessionMemo | null>(() => {
    return (
      response?.memo_updates ??
      getLatestMemoBeforePhase(responseHistory, currentPhase)
    );
  }, [response, responseHistory, currentPhase]);
  const canGenerateFinalMarkdown =
    Boolean(memo) &&
    (currentPhase === "group_chat" || currentPhase === "final_memo") &&
    !getPendingRequiredQuestionMessage() &&
    !isLoading &&
    !isGeneratingExperts &&
    !isGeneratingFinalMarkdown &&
    !isUpdatingInterruptionMemo;
  const sessionConsultation = getSessionConsultation(
    startedConsultation,
    consultation,
  );
  const availableReturnPhases = useMemo(() => {
    return getReturnablePhases(currentPhase, responseHistory);
  }, [currentPhase, responseHistory]);

  async function startSession() {
    if (isUpdatingInterruptionMemo) return;

    setErrorMessage("");

    const request = buildStartRequest();
    if (!request.consultation.trim()) {
      setFailedFacilitatorRequest(null);
      setErrorMessage("相談内容を入力してください。");
      return;
    }

    setFailedFacilitatorRequest(null);
    await sendStartRequest(request);
  }

  /**
   * 相談開始 API の送信と失敗リクエスト保持を行う。
   *
   * 仕様対応: `docs/api/schemas.md#初回・前提整理 route の追加検証`。
   */
  async function sendStartRequest(request: ConsultationStartRequest) {
    setIsLoading(true);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setMemoNotice("");
    setStartedConsultation("");
    setResponse(null);
    setResponseHistory(clearResponseHistory());
    setCurrentPhase("consultation_input");
    setExpertComments([]);
    dispatchGroupChat({ type: "reset" });
    setInitialExpertRequests([]);
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");

    try {
      const { ok, body } = await postFacilitatorRequest(
        "/api/facilitator/start",
        request,
      );

      if (!ok) {
        setErrorMessage(body.message ?? invalidGenerationMessage);
        setFailedFacilitatorRequest(
          createFailedFacilitatorRequest({
            endpoint: "start",
            request,
          }),
        );
        return;
      }

      const facilitatorResponse = body as FacilitatorResponse;
      if (!isAcceptedM2Response(facilitatorResponse)) {
        setErrorMessage("前提整理として受け入れられない応答が返されました。");
        setFailedFacilitatorRequest(
          createFailedFacilitatorRequest({
            endpoint: "start",
            request,
          }),
        );
        return;
      }

      setFailedFacilitatorRequest(null);
      const nextPhase = getFacilitatorResponsePhase(facilitatorResponse);
      const nextResponse = createResponseForPhase(
        facilitatorResponse,
        nextPhase,
      );
      setCurrentPhase(nextPhase);
      setResponse(nextResponse);
      setStartedConsultation(request.consultation);
      setConsultation(request.consultation);
      setFacts(request.facts ?? "");
      setValues(request.values ?? "");
      setConcerns(request.concerns ?? "");
      setExpectedOutcome(request.expectedOutcome ?? "");
      setSelectedQuestionOption("");
      setOtherQuestionAnswer("");
      setIsInterruptionReady(false);
      setSelectedInterruptionOption("");
      setInterruptionOtherAnswer("");
      setExpertComments([]);
      setInitialExpertRequests(
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
      setFailedFacilitatorRequest(
        createFailedFacilitatorRequest({
          endpoint: "start",
          request,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 前提整理の必須質問への回答を送信する。
   *
   * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/respond`。
   */
  async function respondToQuestion() {
    if (isUpdatingInterruptionMemo) return;

    setErrorMessage("");

    const question = response?.user_question;
    const answer = getPremiseAnswer(response);
    const currentMemo = response?.memo_updates;
    if (!question || !currentMemo || currentPhase !== "premise") return;

    if (!answer) {
      setFailedFacilitatorRequest(null);
      setErrorMessage("質問に回答してください。");
      return;
    }

    const request = buildFacilitatorResponseRequest({
      consultation: sessionConsultation,
      currentPhase,
      userQuestion: question,
      userQuestionAnswer: answer,
      memo: currentMemo,
    });

    if (!request) return;

    setFailedFacilitatorRequest(null);
    await sendQuestionResponseRequest(request);
  }

  /**
   * 前提整理の確認回答 API 送信と失敗リクエスト保持を行う。
   *
   * 仕様対応: `docs/api/schemas.md#初回・前提整理 route の追加検証`。
   */
  async function sendQuestionResponseRequest(
    request: FacilitatorResponseRequest,
  ) {
    setIsLoading(true);

    try {
      const { ok, body } = await postFacilitatorRequest(
        "/api/facilitator/respond",
        request,
      );

      if (!ok) {
        setErrorMessage(body.message ?? invalidGenerationMessage);
        setFailedFacilitatorRequest(
          createFailedFacilitatorRequest({
            endpoint: "respond",
            request,
          }),
        );
        return;
      }

      const facilitatorResponse = body as FacilitatorResponse;
      if (!isAcceptedM2Response(facilitatorResponse)) {
        setErrorMessage("前提整理として受け入れられない応答が返されました。");
        setFailedFacilitatorRequest(
          createFailedFacilitatorRequest({
            endpoint: "respond",
            request,
          }),
        );
        return;
      }

      setFailedFacilitatorRequest(null);
      const nextPhase = getFacilitatorResponsePhase(facilitatorResponse);
      const nextResponse = createResponseForPhase(
        facilitatorResponse,
        nextPhase,
      );
      setCurrentPhase(nextPhase);
      setResponse(nextResponse);
      setResponseHistory((current) => ({
        ...current,
        premise: facilitatorResponse,
        ...(nextPhase === "expert_selection"
          ? { expert_selection: nextResponse }
          : {}),
      }));
      setSelectedQuestionOption("");
      setOtherQuestionAnswer("");
      setInitialExpertRequests(
        nextPhase === "expert_selection"
          ? facilitatorResponse.expert_requests
          : [],
      );
      showInterruptionOptionsIfPaused();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
      setFailedFacilitatorRequest(
        createFailedFacilitatorRequest({
          endpoint: "respond",
          request,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * ユーザーの明示操作で、失敗した API リクエストと同一内容を再送する。
   *
   * 仕様対応: `docs/api/schemas.md#初回・前提整理 route の追加検証`。
   */
  /**
   * 相談開始 API に送る初回入力を作成する。
   *
   * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/start`。
   */
  function buildStartRequest(): ConsultationStartRequest {
    return buildConsultationStartRequest({
      consultation,
      facts,
      values,
      concerns,
      expectedOutcome,
    });
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

  function restoreQuestionAnswer(
    answer: string | undefined,
    storedResponse: FacilitatorResponse | null,
  ) {
    const question = storedResponse?.user_question;
    if (!answer || !question) {
      setSelectedQuestionOption("");
      setOtherQuestionAnswer("");
      return;
    }

    if (question.options.includes(answer)) {
      setSelectedQuestionOption(answer);
      setOtherQuestionAnswer("");
      return;
    }

    setSelectedQuestionOption("その他");
    setOtherQuestionAnswer(answer);
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
      isStartingGroupChat ||
      isGeneratingFinalMarkdown ||
      isUpdatingInterruptionMemo
    )
      return;

    window.localStorage.removeItem(storageKey);
    setConsultation("");
    setStartedConsultation("");
    setFacts("");
    setValues("");
    setConcerns("");
    setExpectedOutcome("");
    setResponse(null);
    setResponseHistory({});
    setCurrentPhase("consultation_input");
    setErrorMessage("");
    setFailedFacilitatorRequest(null);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
    setMemoNotice("");
    setSelectedQuestionOption("");
    setOtherQuestionAnswer("");
    setExpertDrafts([]);
    setInitialExpertRequests([]);
    setConfirmedExperts([]);
    setExpertComments([]);
    dispatchGroupChat({ type: "reset" });
    setExpertErrorMessage("");
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");
  }

  function returnToPhase(targetPhase: Phase) {
    if (
      isLoading ||
      isGeneratingExperts ||
      isStartingGroupChat ||
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
    setErrorMessage("");
    setFailedFacilitatorRequest(null);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
    setMemoNotice("");
    setSelectedQuestionOption("");
    setOtherQuestionAnswer("");
    setExpertDrafts([]);
    if (targetPhase !== "expert_selection") {
      setInitialExpertRequests([]);
    }
    if (!(currentPhase === "group_chat" && targetPhase === "deliberation")) {
      setConfirmedExperts([]);
    }
    setExpertComments(getExpertCommentsForReturn(targetPhase, expertComments));
    if (currentPhase === "group_chat" && targetPhase === "deliberation") {
      dispatchGroupChat({ type: "reset" });
    }
    setExpertErrorMessage("");
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");
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

    setInitialExpertRequests(response.expert_requests);
    setCurrentPhase("expert_selection");
    setResponse(nextResponse);
    setResponseHistory((current) => ({
      ...keepResponsesThroughPhase(current, "premise"),
      premise: current.premise ?? response,
      expert_selection: nextResponse,
    }));
  }

  function confirmExpertDrafts() {
    if (isExpertInteractionDisabled) return;

    const requiredQuestionMessage = getPendingRequiredQuestionMessage();
    if (requiredQuestionMessage) {
      setExpertErrorMessage(requiredQuestionMessage);
      return;
    }

    const confirmation = getExpertDraftConfirmation(expertDrafts);
    if (confirmation.errorMessage) {
      setExpertErrorMessage(confirmation.errorMessage);
      return;
    }

    setConfirmedExperts(confirmation.experts);
    setExpertComments([]);
    setExpertErrorMessage("");
    saveConfirmedExpertDrafts(confirmation.experts);
  }

  /**
   * ファシリテーターが最初に提示した候補だけを、編集内容なしで確定する。
   *
   * 仕様対応: `docs/api/schemas.md#初回専門家コメント生成`。
   */
  function confirmInitialExpertDrafts() {
    if (isExpertInteractionDisabled) return;

    const confirmation = getExpertDraftConfirmation(initialExpertRequests);
    if (confirmation.errorMessage) {
      setExpertErrorMessage(confirmation.errorMessage);
      return;
    }

    setExpertDrafts(initialExpertRequests.map(createExpertDraft));
    setConfirmedExperts(confirmation.experts);
    setExpertComments([]);
    setExpertErrorMessage("");
    saveConfirmedExpertDrafts(confirmation.experts);
  }

  async function generateExpertComments() {
    if (isExpertInteractionDisabled) return;

    setExpertErrorMessage("");

    const requiredQuestionMessage = getPendingRequiredQuestionMessage();
    if (requiredQuestionMessage) {
      setExpertErrorMessage(requiredQuestionMessage);
      return;
    }

    if (confirmedExperts.length === 0) {
      setExpertErrorMessage("先に専門家ロールを確定してください。");
      return;
    }

    if (currentPhase === "premise") {
      setExpertErrorMessage("先に専門家ロールを確定してください。");
      return;
    }

    const expertCommentPhase =
      currentPhase === "expert_selection" ? "deliberation" : currentPhase;

    setIsGeneratingExperts(true);
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");

    try {
      const result = await collectExpertCommentGenerationResults(
        confirmedExperts.map((expert) => async () => {
          const request: ExpertCommentRequest = {
            consultation: sessionConsultation,
            currentPhase: expertCommentPhase,
            memo: memo ?? undefined,
            expert,
          };
          return (await requestComment(request)) as ExpertComment;
        }),
      );

      if (result.errorMessage) {
        setExpertComments([]);
        setExpertErrorMessage(result.errorMessage);
        return;
      }

      setExpertComments(result.comments);
      confirmedExpertRequestKeyRef.current = JSON.stringify(confirmedExperts);
      moveResponseToPhase("deliberation");
    } catch (error) {
      setGroupChatErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsGeneratingExperts(false);
    }
  }

  /** 初回専門家コメントからグループチャットを開始する。 */
  async function startGroupChat() {
    if (
      isStartingGroupChat ||
      !memo ||
      confirmedExperts.length === 0 ||
      confirmedExperts.length !== expertComments.length
    ) {
      setExpertErrorMessage(
        "意見交換を始めるための専門家コメントを確認してください。",
      );
      return;
    }

    const experts = confirmedExperts.map((expert, index) => ({
      ...expert,
      participantId: `expert-${index + 1}`,
    }));
    setIsStartingGroupChat(true);
    setGroupChatErrorMessage("");
    dispatchGroupChat({ type: "reset" });
    try {
      const body = await postGroupChatJson(
        "/api/facilitator/group-chat/start",
        {
          consultation: sessionConsultation,
          currentPhase: "group_chat",
          memo,
          confirmedExperts: experts,
          initialExpertComments: expertComments,
        },
      );
      const parsedTurn = FacilitatorTurnSchema.safeParse(body);
      if (!parsedTurn.success) {
        throw new Error("意見交換の開始に失敗しました。再試行してください。");
      }

      const message = createFacilitatorMessage(parsedTurn.data);
      moveResponseToPhase("group_chat");
      const nextMemo = parsedTurn.data.memoUpdate ?? memo;
      const nextContextSummary =
        parsedTurn.data.contextSummaryUpdate ?? parsedTurn.data.message;
      applyGroupChatTurnUpdate(parsedTurn.data);
      dispatchGroupChat({
        type: "set_turn",
        messages: [message],
        turn: parsedTurn.data,
        contextSummary: nextContextSummary,
        expertRepliesSinceUser: 0,
      });
      if (parsedTurn.data.requestedSpeaker.speakerType === "expert") {
        await requestGroupChatExpertReply(
          parsedTurn.data,
          experts,
          [message],
          0,
          nextMemo,
          nextContextSummary,
        );
      }
    } catch (error) {
      setGroupChatErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsStartingGroupChat(false);
      showInterruptionOptionsIfPaused();
    }
  }

  /** 指名専門家の発言を生成し、次の進行ターンを要求する。 */
  async function requestGroupChatExpertReply(
    turn: FacilitatorTurn,
    experts: Array<ExpertRequest & { participantId: string }>,
    messages: GroupChatMessage[],
    expertRepliesSinceUser: number,
    currentMemo: SessionMemo,
    contextSummary: string,
  ) {
    const expert = experts.find(
      (candidate) =>
        candidate.participantId === turn.requestedSpeaker.participantId,
    );
    if (!expert) throw new Error("指名された専門家を確認できませんでした。");

    const body = await postGroupChatJson("/api/expert/group-chat", {
      consultation: sessionConsultation,
      currentPhase: "group_chat",
      memo: currentMemo,
      contextSummary,
      recentMessages: messages,
      expert,
      facilitatorQuestion: turn.question,
    });
    const parsedMessage = GroupChatMessageSchema.safeParse(body);
    if (!parsedMessage.success) {
      throw new Error("専門家の回答生成に失敗しました。再試行してください。");
    }
    await requestNextGroupChatTurn(
      [...messages, parsedMessage.data],
      experts,
      expertRepliesSinceUser + 1,
      currentMemo,
      contextSummary,
    );
  }

  /** 次の発言者を要求し、専門家指名なら連続回答を進める。 */
  async function requestNextGroupChatTurn(
    messages: GroupChatMessage[],
    experts: Array<ExpertRequest & { participantId: string }>,
    expertRepliesSinceUser: number,
    currentMemo: SessionMemo,
    contextSummary: string,
  ) {
    const body = await postGroupChatJson("/api/facilitator/group-chat/next", {
      consultation: sessionConsultation,
      currentPhase: "group_chat",
      memo: currentMemo,
      contextSummary,
      recentMessages: messages,
      confirmedExperts: experts,
      expertRepliesSinceUser,
    });
    const parsedTurn = FacilitatorTurnSchema.safeParse(body);
    if (!parsedTurn.success) {
      throw new Error("次の意見交換の進行に失敗しました。再試行してください。");
    }
    const facilitatorMessage = createFacilitatorMessage(parsedTurn.data);
    const nextMessages = [...messages, facilitatorMessage];
    const nextMemo = parsedTurn.data.memoUpdate ?? currentMemo;
    const nextContextSummary =
      parsedTurn.data.contextSummaryUpdate ?? contextSummary;
    applyGroupChatTurnUpdate(parsedTurn.data);
    dispatchGroupChat({
      type: "set_turn",
      messages: nextMessages,
      turn: parsedTurn.data,
      contextSummary: nextContextSummary,
      expertRepliesSinceUser,
    });
    if (pauseRequestedRef.current) return;
    if (
      parsedTurn.data.requestedSpeaker.speakerType === "expert" &&
      expertRepliesSinceUser < 2
    ) {
      await requestGroupChatExpertReply(
        parsedTurn.data,
        experts,
        nextMessages,
        expertRepliesSinceUser,
        nextMemo,
        nextContextSummary,
      );
    }
  }

  /** ユーザー発言を記録して次の進行ターンを要求する。 */
  async function sendGroupChatUserAnswer(answer: string) {
    if (!groupChatTurn || !memo || !answer.trim()) return;
    const experts = confirmedExperts.map((expert, index) => ({
      ...expert,
      participantId: `expert-${index + 1}`,
    }));
    setIsStartingGroupChat(true);
    try {
      const message = createUserMessage(answer);
      await requestNextGroupChatTurn(
        [...groupChatMessages, message],
        experts,
        0,
        memo,
        groupChatTurn.contextSummaryUpdate ?? groupChatContextSummary,
      );
      dispatchGroupChat({ type: "set_other_answer", value: "" });
    } catch (error) {
      setGroupChatErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsStartingGroupChat(false);
    }
  }

  /** 失敗した専門家回答を、同じ指名ターンで再生成する。 */
  async function retryGroupChatExpertReply() {
    if (
      !groupChatTurn ||
      groupChatTurn.requestedSpeaker.speakerType !== "expert" ||
      !memo ||
      isStartingGroupChat
    )
      return;
    const experts = confirmedExperts.map((expert, index) => ({
      ...expert,
      participantId: `expert-${index + 1}`,
    }));
    setIsStartingGroupChat(true);
    setGroupChatErrorMessage("");
    try {
      await requestGroupChatExpertReply(
        groupChatTurn,
        experts,
        groupChatMessages,
        expertRepliesSinceUser,
        memo,
        groupChatContextSummary || groupChatTurn.message,
      );
    } catch (error) {
      setGroupChatErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsStartingGroupChat(false);
    }
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
      setFailedFacilitatorRequest((current) =>
        replaceMemoInFailedFacilitatorRequest(current, updatedMemo),
      );
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

  function saveCurrentSession() {
    const session = buildStoredSession();
    window.localStorage.setItem(storageKey, JSON.stringify(session));
    setMemoNotice("この端末に一時保存しました。");
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

    confirmedExpertRequestKeyRef.current = JSON.stringify(experts);
    setFailedFacilitatorRequest(null);
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
          <ConsultationInputPhase
            consultation={consultation}
            facts={facts}
            values={values}
            concerns={concerns}
            expectedOutcome={expectedOutcome}
            isBusy={
              isLoading ||
              isGeneratingExperts ||
              isStartingGroupChat ||
              isGeneratingFinalMarkdown ||
              isUpdatingInterruptionMemo
            }
            hasResponse={Boolean(response)}
            canRequestPause={canRequestPause}
            pauseRequested={pauseRequested}
            errorMessage={errorMessage}
            canRetry={Boolean(failedFacilitatorRequest)}
            onConsultationChange={setConsultation}
            onFactsChange={setFacts}
            onValuesChange={setValues}
            onConcernsChange={setConcerns}
            onExpectedOutcomeChange={setExpectedOutcome}
            onStart={() => void startSession()}
            onRequestPause={requestPause}
            onRetry={() =>
              void retryFacilitatorRequest({
                onStart: sendStartRequest,
                onRespond: sendQuestionResponseRequest,
              })
            }
          />

          <PhaseContent
            currentPhase={currentPhase}
            render={() =>
              response && (
                <article className="message-card">
                  <div className="message-label">ファシリテーター</div>
                  <p>{response.facilitator_message}</p>
                  <p className="next-action">
                    候補行動: {nextActionLabels[response.next_action]}
                  </p>

                  {currentPhase === "premise" && (
                    <PremisePhase
                      canProceed={canProceedToExpertSelection(response)}
                      isBusy={
                        isLoading ||
                        isGeneratingExperts ||
                        isStartingGroupChat ||
                        isGeneratingFinalMarkdown ||
                        isUpdatingInterruptionMemo
                      }
                      onProceed={proceedToExpertSelection}
                    />
                  )}
                  {currentPhase === "expert_selection" &&
                    response.expert_requests.length > 0 && (
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
                    )}
                  {currentPhase === "deliberation" && (
                    <DeliberationPhase
                      expertComments={expertComments}
                      isStarting={isStartingGroupChat}
                      errorMessage={expertErrorMessage}
                      onStart={() => void startGroupChat()}
                    />
                  )}
                  {currentPhase === "group_chat" && (
                    <GroupChatPhase
                      turn={groupChatTurn}
                      messages={groupChatMessages}
                      otherAnswer={groupChatOtherAnswer}
                      isLoading={isStartingGroupChat}
                      errorMessage={groupChatErrorMessage}
                      onOtherAnswerChange={(value) =>
                        dispatchGroupChat({ type: "set_other_answer", value })
                      }
                      onUserAnswer={(answer) =>
                        void sendGroupChatUserAnswer(answer)
                      }
                      onRetryExpertReply={() =>
                        void retryGroupChatExpertReply()
                      }
                    />
                  )}
                  {response.user_question && (
                    <div className="question-box">
                      <strong>{response.user_question.question}</strong>
                      <div className="option-list">
                        {response.user_question.options.map((option) => (
                          <button
                            type="button"
                            key={option}
                            className={
                              selectedQuestionOption === option
                                ? "selected"
                                : undefined
                            }
                            onClick={() => setSelectedQuestionOption(option)}
                            disabled={isLoading || isUpdatingInterruptionMemo}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      {selectedQuestionOption === "その他" && (
                        <label className="field inline-field">
                          <span>自由入力</span>
                          <textarea
                            value={otherQuestionAnswer}
                            onChange={(event) =>
                              setOtherQuestionAnswer(event.target.value)
                            }
                            rows={3}
                            disabled={isLoading || isUpdatingInterruptionMemo}
                          />
                        </label>
                      )}
                      <div className="action-row">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={respondToQuestion}
                          disabled={isLoading || isUpdatingInterruptionMemo}
                        >
                          {isLoading ? "回答を整理中..." : "回答を送る"}
                        </button>
                      </div>
                    </div>
                  )}

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
                  isStartingGroupChat ||
                  isGeneratingFinalMarkdown ||
                  isUpdatingInterruptionMemo
                }
              >
                削除
              </button>
            </div>
            <p className="privacy-note">この端末に一時保存されます。</p>
            <div className="memo-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={saveCurrentSession}
              >
                一時保存
              </button>
              <FinalMemoPhase
                canGenerate={canGenerateFinalMarkdown}
                isGenerating={isGeneratingFinalMarkdown}
                finalMarkdown={finalMarkdown}
                errorMessage={finalMarkdownErrorMessage}
                onGenerate={() =>
                  void finalMemoPhase.generate({
                    consultation: sessionConsultation,
                    memo,
                    expertComments,
                    requiredQuestionMessage:
                      getPendingRequiredQuestionMessage(),
                    onComplete: () => moveResponseToPhase("final_memo"),
                  })
                }
                onDownload={finalMemoPhase.download}
              />
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

/**
 * 初回・前提整理のファシリテーター応答制約をクライアント側でも検証する。
 *
 * 仕様対応: `docs/api/schemas.md#初回・前提整理 route の追加検証`。
 */
function isAcceptedM2Response(response: FacilitatorResponse) {
  if (response.current_phase !== "premise") return false;

  if (response.user_question) {
    return (
      response.user_question.required && response.next_action === "wait_user"
    );
  }

  return (
    response.next_action === "request_experts" &&
    response.expert_requests.length > 0
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
