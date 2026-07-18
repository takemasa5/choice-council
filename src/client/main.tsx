import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ConsultationStartRequest,
  ConsultationRequest,
  ExpertComment,
  ExpertCommentRequest,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorResponseRequest,
  FacilitatorTurn,
  FinalMarkdown,
  FinalMarkdownRequest,
  FinalSessionMemo,
  Phase,
  SessionMemo,
  SessionMemoRequest,
  GroupChatMessage,
} from "../shared/schemas/session";
import {
  FacilitatorTurnSchema,
  GroupChatMessageSchema,
  maximumExpertRequestCount,
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
  type FailedFacilitatorRequest,
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
  finalMarkdown?: string;
  interruption?: {
    isReady: boolean;
    selectedOption: string;
    otherAnswer: string;
  };
};

/** 日本語名: 画面上の候補行を識別する安定ID付き専門家候補。 */
type ExpertDraft = ExpertRequest & { draftId: string };

function App() {
  const [consultation, setConsultation] = useState("");
  const [startedConsultation, setStartedConsultation] = useState("");
  const [facts, setFacts] = useState("");
  const [values, setValues] = useState("");
  const [concerns, setConcerns] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [response, setResponse] = useState<FacilitatorResponse | null>(null);
  const [responseHistory, setResponseHistory] = useState<ResponseHistory>({});
  const [currentPhase, setCurrentPhase] = useState<Phase>("consultation_input");
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedFacilitatorRequest, setFailedFacilitatorRequest] =
    useState<FailedFacilitatorRequest | null>(null);
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
  const [selectedQuestionOption, setSelectedQuestionOption] = useState("");
  const [otherQuestionAnswer, setOtherQuestionAnswer] = useState("");
  const [expertDrafts, setExpertDrafts] = useState<ExpertDraft[]>([]);
  const expertDraftIdRef = useRef(0);
  const [initialExpertRequests, setInitialExpertRequests] = useState<
    ExpertRequest[]
  >([]);
  const [confirmedExperts, setConfirmedExperts] = useState<ExpertRequest[]>([]);
  const confirmedExpertRequestKeyRef = useRef("");
  const [expertComments, setExpertComments] = useState<ExpertComment[]>([]);
  const [isGeneratingExperts, setIsGeneratingExperts] = useState(false);
  const [isStartingGroupChat, setIsStartingGroupChat] = useState(false);
  const [groupChatMessages, setGroupChatMessages] = useState<
    GroupChatMessage[]
  >([]);
  const [groupChatTurn, setGroupChatTurn] = useState<FacilitatorTurn | null>(
    null,
  );
  const [expertErrorMessage, setExpertErrorMessage] = useState("");
  const [finalMarkdown, setFinalMarkdown] = useState("");
  const [isGeneratingFinalMarkdown, setIsGeneratingFinalMarkdown] =
    useState(false);
  const [finalMarkdownErrorMessage, setFinalMarkdownErrorMessage] =
    useState("");
  const canRequestPause =
    isLoading || isGeneratingExperts || isStartingGroupChat;
  const isExpertInteractionDisabled =
    isExpertDraftEditingDisabled(isGeneratingExperts) ||
    isStartingGroupChat ||
    isUpdatingInterruptionMemo;
  const expertRequestKey = useMemo(() => {
    return JSON.stringify(response?.expert_requests ?? []);
  }, [response?.expert_requests]);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setHasRestoredSession(true);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as StoredSession;
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
      setGroupChatMessages(parsed.groupChatMessages ?? []);
      setGroupChatTurn(parsed.groupChatTurn ?? null);
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
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setHasRestoredSession(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredSession) return;

    const hasSessionContent =
      consultation.trim() ||
      facts.trim() ||
      values.trim() ||
      concerns.trim() ||
      expectedOutcome.trim() ||
      response ||
      Object.keys(responseHistory).length > 0 ||
      expertComments.length > 0 ||
      finalMarkdown;

    if (!hasSessionContent) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const session = buildStoredSession();
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, [
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
    initialExpertRequests,
    finalMarkdown,
    selectedQuestionOption,
    otherQuestionAnswer,
    selectedInterruptionOption,
    interruptionOtherAnswer,
    hasRestoredSession,
  ]);

  useEffect(() => {
    setExpertDrafts((response?.expert_requests ?? []).map(createExpertDraft));
    if (confirmedExpertRequestKeyRef.current === expertRequestKey) {
      confirmedExpertRequestKeyRef.current = "";
    } else {
      setConfirmedExperts([]);
    }
    setExpertErrorMessage("");
  }, [expertRequestKey, currentPhase]);

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
    !isStartingGroupChat &&
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
   * 仕様対応: `docs/tasks/milestone-2.md#初期遷移` と
   * `docs/tasks/milestone-2.md#API エラー表示`。
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
    setGroupChatMessages([]);
    setGroupChatTurn(null);
    setInitialExpertRequests([]);
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");

    try {
      const apiResponse = await fetch("/api/facilitator/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const body = await apiResponse.json();

      if (!apiResponse.ok) {
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
   * 仕様対応: `docs/tasks/milestone-2.md#前提整理での確認回答`。
   */
  async function respondToQuestion() {
    if (isUpdatingInterruptionMemo) return;

    setErrorMessage("");

    const question = response?.user_question;
    const answer = getResponseQuestionAnswer();
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
   * 仕様対応: `docs/tasks/milestone-2.md#前提整理での確認回答` と
   * `docs/tasks/milestone-2.md#API エラー表示`。
   */
  async function sendQuestionResponseRequest(
    request: FacilitatorResponseRequest,
  ) {
    setIsLoading(true);

    try {
      const apiResponse = await fetch("/api/facilitator/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await apiResponse.json();

      if (!apiResponse.ok) {
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
   * 仕様対応: `docs/tasks/milestone-2.md#API エラー表示`。
   */
  async function retryFailedFacilitatorRequest() {
    if (!failedFacilitatorRequest || isLoading || isUpdatingInterruptionMemo)
      return;

    setErrorMessage("");
    if (failedFacilitatorRequest.endpoint === "start") {
      await sendStartRequest(failedFacilitatorRequest.request);
      return;
    }

    await sendQuestionResponseRequest(failedFacilitatorRequest.request);
  }

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

    return getResponseQuestionAnswer();
  }

  function getResponseQuestionAnswer() {
    if (response?.user_question) {
      if (!selectedQuestionOption) return undefined;
      if (selectedQuestionOption === "その他")
        return emptyToUndefined(otherQuestionAnswer);
      return selectedQuestionOption;
    }

    return undefined;
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
    setExpertErrorMessage("");
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");
  }

  function returnToPhase(targetPhase: Phase) {
    if (
      isLoading ||
      isGeneratingExperts ||
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
      setGroupChatMessages([]);
      setGroupChatTurn(null);
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

  function updateExpertDraft(
    index: number,
    field: keyof ExpertRequest,
    value: string,
  ) {
    if (isExpertInteractionDisabled) return;

    resetConfirmedExperts();
    setExpertDrafts((current) => {
      return current.map((expert, currentIndex) => {
        return currentIndex === index ? { ...expert, [field]: value } : expert;
      });
    });
  }

  /** 専門家候補に入力内容と独立した安定IDを付与する。 */
  function createExpertDraft(expert: ExpertRequest): ExpertDraft {
    expertDraftIdRef.current += 1;
    return { ...expert, draftId: `expert-draft-${expertDraftIdRef.current}` };
  }

  function addExpertDraft() {
    if (isExpertInteractionDisabled) return;

    resetConfirmedExperts();
    setExpertDrafts((current) => [
      ...current,
      createExpertDraft({ role_name: "", viewpoint: "", request: "" }),
    ]);
  }

  function removeExpertDraft(index: number) {
    if (isExpertInteractionDisabled) return;

    resetConfirmedExperts();
    setExpertDrafts((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function replaceExpertDraft(index: number) {
    if (isExpertInteractionDisabled) return;

    resetConfirmedExperts();
    setExpertDrafts((current) =>
      current.map((expert, currentIndex) =>
        currentIndex === index
          ? { ...expert, role_name: "", viewpoint: "", request: "" }
          : expert,
      ),
    );
  }

  function resetConfirmedExperts() {
    if (isExpertInteractionDisabled) return;

    setFailedFacilitatorRequest(null);
    setConfirmedExperts([]);
    setExpertComments([]);
    setExpertErrorMessage("");
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
   * 仕様対応: `docs/tasks/milestone-3.md#専門家候補の表示と編集`。
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
          const apiResponse = await fetch("/api/expert/comment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
          });
          const body = await apiResponse.json();

          if (!apiResponse.ok) {
            throw new Error(body.message ?? invalidGenerationMessage);
          }

          return body as ExpertComment;
        }),
      );

      if (result.errorMessage) {
        setExpertComments([]);
        setExpertErrorMessage(result.errorMessage);
        return;
      }

      setExpertComments(result.comments);
      moveResponseToPhase("deliberation");
    } catch (error) {
      setExpertErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsGeneratingExperts(false);
    }
  }

  /**
   * 初回専門家コメントを引き継いで、グループチャットの最初の進行を開始する。
   *
   * 仕様対応: `docs/tasks/milestone-4.md#会話制御`。
   */
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

    const groupChatExperts = confirmedExperts.map((expert, index) => ({
      ...expert,
      participantId: `expert-${index + 1}`,
    }));
    setIsStartingGroupChat(true);
    setExpertErrorMessage("");

    try {
      const startResponse = await fetch("/api/facilitator/group-chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultation: sessionConsultation,
          currentPhase: "group_chat",
          memo,
          confirmedExperts: groupChatExperts,
          initialExpertComments: expertComments,
        }),
      });
      const startBody: unknown = await startResponse.json();
      const startTurn = FacilitatorTurnSchema.safeParse(startBody);
      if (!startResponse.ok || !startTurn.success) {
        throw new Error("意見交換の開始に失敗しました。再試行してください。");
      }

      moveResponseToPhase("group_chat");
      const facilitatorMessage = createFacilitatorGroupChatMessage(
        startTurn.data,
      );
      setGroupChatMessages([facilitatorMessage]);
      setGroupChatTurn(startTurn.data);
      if (startTurn.data.requestedSpeaker.speakerType === "user") return;

      await requestGroupChatExpertReply(
        startTurn.data,
        groupChatExperts,
        memo,
        facilitatorMessage,
      );
    } catch (error) {
      setExpertErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsStartingGroupChat(false);
    }
  }

  /**
   * 指名された専門家の回答後、次の発言者をファシリテーターへ求める。
   *
   * 仕様対応: `docs/tasks/milestone-4.md#会話制御`。
   */
  async function requestGroupChatExpertReply(
    turn: FacilitatorTurn,
    groupChatExperts: Array<ExpertRequest & { participantId: string }>,
    currentMemo: SessionMemo,
    facilitatorMessage: GroupChatMessage,
  ) {
    const expert = groupChatExperts.find(
      (candidate) =>
        candidate.participantId === turn.requestedSpeaker.participantId,
    );
    if (!expert) {
      throw new Error("指名された専門家を確認できませんでした。");
    }

    const expertResponse = await fetch("/api/expert/group-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultation: sessionConsultation,
        currentPhase: "group_chat",
        memo: currentMemo,
        contextSummary: turn.contextSummaryUpdate ?? turn.message,
        recentMessages: [facilitatorMessage],
        expert,
        facilitatorQuestion: turn.question,
      }),
    });
    const expertBody: unknown = await expertResponse.json();
    const expertMessage = GroupChatMessageSchema.safeParse(expertBody);
    if (!expertResponse.ok || !expertMessage.success) {
      throw new Error(
        "専門家の意見交換回答に失敗しました。再試行してください。",
      );
    }

    const nextResponse = await fetch("/api/facilitator/group-chat/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultation: sessionConsultation,
        currentPhase: "group_chat",
        memo: currentMemo,
        contextSummary: turn.contextSummaryUpdate ?? turn.message,
        recentMessages: [facilitatorMessage, expertMessage.data],
        confirmedExperts: groupChatExperts,
        expertRepliesSinceUser: 1,
      }),
    });
    const nextBody: unknown = await nextResponse.json();
    const nextTurn = FacilitatorTurnSchema.safeParse(nextBody);
    if (!nextResponse.ok || !nextTurn.success) {
      throw new Error("次の意見交換の進行に失敗しました。再試行してください。");
    }
    setGroupChatMessages((messages) => [...messages, expertMessage.data]);
    setGroupChatTurn(nextTurn.data);
  }

  /** ファシリテーターターンを表示用の発言へ変換する。 */
  function createFacilitatorGroupChatMessage(
    turn: FacilitatorTurn,
  ): GroupChatMessage {
    return {
      id: `facilitator-${Date.now()}`,
      speakerType: "facilitator",
      speakerName: "ファシリテーター",
      participantId: "facilitator",
      content: turn.message,
      createdAt: new Date().toISOString(),
    };
  }

  async function generateFinalMarkdown() {
    if (isUpdatingInterruptionMemo) return;

    setFinalMarkdownErrorMessage("");

    const requiredQuestionMessage = getPendingRequiredQuestionMessage();
    if (requiredQuestionMessage) {
      setFinalMarkdownErrorMessage(requiredQuestionMessage);
      return;
    }

    if (!memo) {
      setFinalMarkdownErrorMessage(
        "終了メモを作るためのセッションメモがまだありません。",
      );
      return;
    }

    if (!isFinalSessionMemo(memo)) {
      setFinalMarkdownErrorMessage(
        "終了メモ生成前に、方向性整理または次アクション確認まで進めてください。",
      );
      return;
    }

    const request: FinalMarkdownRequest = {
      consultation: sessionConsultation,
      memo,
      expertComments: expertComments.length > 0 ? expertComments : undefined,
    };

    setIsGeneratingFinalMarkdown(true);

    try {
      const apiResponse = await fetch("/api/final-markdown/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await apiResponse.json();

      if (!apiResponse.ok) {
        setFinalMarkdownErrorMessage(body.message ?? invalidGenerationMessage);
        return;
      }

      const generated = body as FinalMarkdown;
      setFinalMarkdown(generated.markdown);
      moveResponseToPhase("final_memo");
    } catch (error) {
      setFinalMarkdownErrorMessage(
        error instanceof Error
          ? error.message
          : "終了メモの生成に失敗しました。",
      );
    } finally {
      setIsGeneratingFinalMarkdown(false);
    }
  }

  function downloadFinalMarkdown() {
    if (!finalMarkdown) return;

    const blob = new Blob([finalMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "choice-council-memo.md";
    link.click();
    URL.revokeObjectURL(url);
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
      userQuestionAnswer: getResponseQuestionAnswer(),
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
          <div className="panel">
            <h2>相談内容</h2>
            <label className="field">
              <span>相談内容</span>
              <textarea
                value={consultation}
                onChange={(event) => setConsultation(event.target.value)}
                placeholder="例: 小5の娘の中学受験をするか迷っています。本人の負担と将来の選択肢のどちらを重視すべきか整理したいです。"
                rows={7}
              />
            </label>

            <button
              className="text-button"
              type="button"
              onClick={() => setShowOptionalFields((current) => !current)}
            >
              {showOptionalFields ? "任意項目を閉じる" : "任意項目を開く"}
            </button>

            {showOptionalFields && (
              <div className="optional-grid">
                <label className="field">
                  <span>事実・背景</span>
                  <textarea
                    value={facts}
                    onChange={(event) => setFacts(event.target.value)}
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span>重視したいこと</span>
                  <textarea
                    value={values}
                    onChange={(event) => setValues(event.target.value)}
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span>不安なこと</span>
                  <textarea
                    value={concerns}
                    onChange={(event) => setConcerns(event.target.value)}
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span>期待する結果</span>
                  <textarea
                    value={expectedOutcome}
                    onChange={(event) => setExpectedOutcome(event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
            )}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startSession}
                disabled={
                  isLoading ||
                  isGeneratingExperts ||
                  isGeneratingFinalMarkdown ||
                  isUpdatingInterruptionMemo
                }
              >
                {isLoading
                  ? "整理中..."
                  : response
                    ? "もう一度整理する"
                    : "相談を開始する"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={requestPause}
                disabled={!canRequestPause}
              >
                ちょっと待って
              </button>
            </div>

            {pauseRequested && <p className="notice">次の区切りで止めます。</p>}
            {errorMessage && (
              <div className="error-block">
                <p className="error">{errorMessage}</p>
                {failedFacilitatorRequest && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={retryFailedFacilitatorRequest}
                    disabled={isLoading || isUpdatingInterruptionMemo}
                  >
                    {isLoading ? "リトライ中..." : "同じ内容でリトライ"}
                  </button>
                )}
              </div>
            )}
          </div>

          {response && (
            <article className="message-card">
              <div className="message-label">ファシリテーター</div>
              <p>{response.facilitator_message}</p>
              <p className="next-action">
                候補行動: {nextActionLabels[response.next_action]}
              </p>

              {currentPhase === "premise" &&
                canProceedToExpertSelection(response) && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={proceedToExpertSelection}
                    disabled={
                      isLoading ||
                      isGeneratingExperts ||
                      isGeneratingFinalMarkdown ||
                      isUpdatingInterruptionMemo
                    }
                  >
                    専門家選定へ進む
                  </button>
                )}

              {currentPhase === "expert_selection" &&
                response.expert_requests.length > 0 && (
                  <section
                    className="expert-request-box"
                    aria-label="専門家ロール候補"
                  >
                    <h3>専門家ロール候補</h3>
                    <div className="expert-request-list">
                      {expertDrafts.map((expertRequest, index) => (
                        <article
                          className="expert-request-item"
                          key={expertRequest.draftId}
                        >
                          <label className="field compact-field">
                            <span>専門家</span>
                            <input
                              value={expertRequest.role_name}
                              onChange={(event) =>
                                updateExpertDraft(
                                  index,
                                  "role_name",
                                  event.target.value,
                                )
                              }
                              disabled={isExpertInteractionDisabled}
                            />
                          </label>
                          <label className="field compact-field">
                            <span>観点</span>
                            <textarea
                              value={expertRequest.viewpoint}
                              onChange={(event) =>
                                updateExpertDraft(
                                  index,
                                  "viewpoint",
                                  event.target.value,
                                )
                              }
                              rows={2}
                              disabled={isExpertInteractionDisabled}
                            />
                          </label>
                          <label className="field compact-field">
                            <span>依頼</span>
                            <textarea
                              value={expertRequest.request}
                              onChange={(event) =>
                                updateExpertDraft(
                                  index,
                                  "request",
                                  event.target.value,
                                )
                              }
                              rows={2}
                              disabled={isExpertInteractionDisabled}
                            />
                          </label>
                          <div className="expert-row-actions">
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => replaceExpertDraft(index)}
                              disabled={isExpertInteractionDisabled}
                            >
                              入れ替え
                            </button>
                            <button
                              className="text-button danger"
                              type="button"
                              onClick={() => removeExpertDraft(index)}
                              disabled={isExpertInteractionDisabled}
                            >
                              外す
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="expert-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={addExpertDraft}
                        disabled={
                          isExpertInteractionDisabled ||
                          expertDrafts.length >= maximumExpertRequestCount
                        }
                      >
                        専門家を追加する
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={confirmInitialExpertDrafts}
                        disabled={isExpertInteractionDisabled}
                      >
                        おまかせで進める
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={confirmExpertDrafts}
                        disabled={isExpertInteractionDisabled}
                      >
                        このまま進める
                      </button>
                    </div>
                    {confirmedExperts.length > 0 && (
                      <div className="confirmed-experts">
                        <strong>確定済み</strong>
                        <ul>
                          {confirmedExperts.map((expert) => (
                            <li key={`${expert.role_name}-${expert.viewpoint}`}>
                              {expert.role_name} / {expert.viewpoint}
                            </li>
                          ))}
                        </ul>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={generateExpertComments}
                          disabled={isExpertInteractionDisabled}
                        >
                          {isGeneratingExperts
                            ? "生成中..."
                            : "専門家コメントを生成する"}
                        </button>
                      </div>
                    )}
                    {expertErrorMessage && (
                      <p className="error">{expertErrorMessage}</p>
                    )}
                  </section>
                )}

              {expertComments.length > 0 && (
                <section
                  className="expert-comment-box"
                  aria-label="専門家コメント"
                >
                  <h3>専門家コメント</h3>
                  <div className="expert-comment-list">
                    {expertComments.map((comment) => (
                      <article
                        className="expert-comment-item"
                        key={`${comment.role_name}-${comment.viewpoint}`}
                      >
                        <div className="expert-comment-header">
                          <strong>{comment.role_name}</strong>
                          <span>{comment.confidence}</span>
                        </div>
                        <p>{comment.summary}</p>
                        <dl>
                          <div>
                            <dt>最重要ポイント</dt>
                            <dd>{comment.key_point}</dd>
                          </div>
                          <div>
                            <dt>懸念・不明点</dt>
                            <dd>{comment.concern}</dd>
                          </div>
                          <div>
                            <dt>質問</dt>
                            <dd>{comment.question_to_user}</dd>
                          </div>
                        </dl>
                        {comment.needs_research && (
                          <p className="research-note">
                            未確認事項として後続整理へ渡します。
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                  {currentPhase === "deliberation" && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={startGroupChat}
                      disabled={isStartingGroupChat}
                    >
                      {isStartingGroupChat
                        ? "意見交換を開始中..."
                        : "意見交換をはじめる"}
                    </button>
                  )}
                </section>
              )}

              {currentPhase === "group_chat" && groupChatTurn && (
                <section className="expert-comment-box" aria-label="意見交換">
                  <h3>意見交換</h3>
                  <div className="expert-comment-list">
                    {groupChatMessages.map((message) => (
                      <article className="expert-comment-item" key={message.id}>
                        <strong>{message.speakerName}</strong>
                        <p>{message.content}</p>
                      </article>
                    ))}
                  </div>
                  <p>{groupChatTurn.question}</p>
                  {groupChatTurn.requestedSpeaker.speakerType === "user" &&
                    groupChatTurn.userOptions && (
                      <div className="option-list">
                        {groupChatTurn.userOptions.map((option) => (
                          <button type="button" key={option} disabled>
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                </section>
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
          )}

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
              <button
                className="primary-button"
                type="button"
                onClick={generateFinalMarkdown}
                disabled={!canGenerateFinalMarkdown}
              >
                {isGeneratingFinalMarkdown
                  ? "終了メモ生成中..."
                  : "終了メモを生成"}
              </button>
              {finalMarkdown && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={downloadFinalMarkdown}
                >
                  Markdown保存
                </button>
              )}
            </div>
            {memoNotice && <p className="notice">{memoNotice}</p>}
            {finalMarkdownErrorMessage && (
              <p className="error">{finalMarkdownErrorMessage}</p>
            )}
            {finalMarkdown && (
              <section
                className="final-markdown-preview"
                aria-label="Markdown終了メモ"
              >
                <h3>Markdown終了メモ</h3>
                <pre>{finalMarkdown}</pre>
              </section>
            )}
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
 * M2 のファシリテーター応答制約をクライアント側でも検証する。
 *
 * 仕様対応: `docs/api/schemas.md#M2 route の追加検証`。
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

function isFinalSessionMemo(memo: SessionMemo): memo is FinalSessionMemo {
  return memo.status !== "in_progress";
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
