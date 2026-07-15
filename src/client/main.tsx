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
  FinalMarkdown,
  FinalMarkdownRequest,
  FinalSessionMemo,
  Phase,
  SessionMemo,
  SessionMemoRequest,
} from "../shared/schemas/session";
import {
  buildConsultationStartRequest,
  buildFacilitatorResponseRequest,
  createFailedFacilitatorRequest,
  getSessionConsultation,
  type FailedFacilitatorRequest,
} from "./facilitator-flow";
import {
  clearResponseHistory,
  createResponseForPhase,
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
  direction: "方向性整理",
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
  finalMarkdown?: string;
  interruption?: {
    isReady: boolean;
    selectedOption: string;
    otherAnswer: string;
  };
};

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
  const [isUpdatingMemo, setIsUpdatingMemo] = useState(false);
  const [memoNotice, setMemoNotice] = useState("");
  const [memoErrorMessage, setMemoErrorMessage] = useState("");
  const [selectedQuestionOption, setSelectedQuestionOption] = useState("");
  const [otherQuestionAnswer, setOtherQuestionAnswer] = useState("");
  const [expertDrafts, setExpertDrafts] = useState<ExpertRequest[]>([]);
  const [confirmedExperts, setConfirmedExperts] = useState<ExpertRequest[]>([]);
  const confirmedExpertRequestKeyRef = useRef("");
  const [expertComments, setExpertComments] = useState<ExpertComment[]>([]);
  const [isGeneratingExperts, setIsGeneratingExperts] = useState(false);
  const [expertErrorMessage, setExpertErrorMessage] = useState("");
  const [finalMarkdown, setFinalMarkdown] = useState("");
  const [isGeneratingFinalMarkdown, setIsGeneratingFinalMarkdown] =
    useState(false);
  const [finalMarkdownErrorMessage, setFinalMarkdownErrorMessage] =
    useState("");
  const canRequestPause = isLoading || isGeneratingExperts;
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
    finalMarkdown,
    selectedQuestionOption,
    otherQuestionAnswer,
    selectedInterruptionOption,
    interruptionOtherAnswer,
    hasRestoredSession,
  ]);

  useEffect(() => {
    setExpertDrafts(response?.expert_requests ?? []);
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
    (currentPhase === "direction" || currentPhase === "final_memo") &&
    !getPendingRequiredQuestionMessage() &&
    !isLoading &&
    !isUpdatingMemo &&
    !isGeneratingExperts &&
    !isGeneratingFinalMarkdown;
  const sessionConsultation = getSessionConsultation(
    startedConsultation,
    consultation,
  );
  const availableReturnPhases = useMemo(() => {
    return getReturnablePhases(currentPhase, responseHistory);
  }, [currentPhase, responseHistory]);

  async function startSession() {
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
    setMemoErrorMessage("");
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
      setCurrentPhase("premise");
      setResponse(facilitatorResponse);
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
      setResponseHistory((current) => ({
        ...keepResponsesThroughPhase(current, currentPhase),
        premise: facilitatorResponse,
      }));
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
      setResponse(facilitatorResponse);
      setResponseHistory((current) => ({
        ...current,
        premise: facilitatorResponse,
      }));
      setSelectedQuestionOption("");
      setOtherQuestionAnswer("");
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
    if (!failedFacilitatorRequest || isLoading) return;

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
      isUpdatingMemo ||
      isGeneratingExperts ||
      isGeneratingFinalMarkdown
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
    setMemoErrorMessage("");
    setSelectedQuestionOption("");
    setOtherQuestionAnswer("");
    setExpertDrafts([]);
    setConfirmedExperts([]);
    setExpertComments([]);
    setExpertErrorMessage("");
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");
  }

  function returnToPhase(targetPhase: Phase) {
    if (
      isLoading ||
      isUpdatingMemo ||
      isGeneratingExperts ||
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
    setErrorMessage("");
    setFailedFacilitatorRequest(null);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsInterruptionReady(false);
    setSelectedInterruptionOption("");
    setInterruptionOtherAnswer("");
    setMemoNotice("");
    setMemoErrorMessage("");
    setSelectedQuestionOption("");
    setOtherQuestionAnswer("");
    setExpertDrafts([]);
    setConfirmedExperts([]);
    setExpertComments([]);
    setExpertErrorMessage("");
    setFinalMarkdown("");
    setFinalMarkdownErrorMessage("");
  }

  function updateExpertDraft(
    index: number,
    field: keyof ExpertRequest,
    value: string,
  ) {
    if (isGeneratingExperts) return;

    resetConfirmedExperts();
    setExpertDrafts((current) => {
      return current.map((expert, currentIndex) => {
        return currentIndex === index ? { ...expert, [field]: value } : expert;
      });
    });
  }

  function addExpertDraft() {
    if (isGeneratingExperts) return;

    resetConfirmedExperts();
    setExpertDrafts((current) => [
      ...current,
      {
        role_name: "",
        viewpoint: "",
        request: "",
      },
    ]);
  }

  function removeExpertDraft(index: number) {
    if (isGeneratingExperts) return;

    resetConfirmedExperts();
    setExpertDrafts((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function replaceExpertDraft(index: number) {
    if (isGeneratingExperts) return;

    resetConfirmedExperts();
    setExpertDrafts((current) => {
      return current.map((expert, currentIndex) => {
        return currentIndex === index
          ? {
              role_name: "",
              viewpoint: "",
              request: expert.request,
            }
          : expert;
      });
    });
  }

  function resetConfirmedExperts() {
    if (isGeneratingExperts) return;

    clearExpertMemoItems(expertComments.map((comment) => comment.role_name));
    setConfirmedExperts([]);
    setExpertComments([]);
    setExpertErrorMessage("");
  }

  function confirmExpertDrafts() {
    if (isGeneratingExperts) return;

    const requiredQuestionMessage = getPendingRequiredQuestionMessage();
    if (requiredQuestionMessage) {
      setExpertErrorMessage(requiredQuestionMessage);
      return;
    }

    const validExperts = expertDrafts.map((expert) => ({
      role_name: expert.role_name.trim(),
      viewpoint: expert.viewpoint.trim(),
      request: expert.request.trim(),
    }));

    const hasIncompleteExpert = validExperts.some((expert) => {
      const enteredFields = [
        expert.role_name,
        expert.viewpoint,
        expert.request,
      ].filter(Boolean).length;
      return enteredFields > 0 && enteredFields < 3;
    });

    if (hasIncompleteExpert) {
      setExpertErrorMessage(
        "追加した専門家ロールの役割名、観点、依頼をすべて入力してください。",
      );
      return;
    }

    const completedExperts = validExperts.filter(
      (expert) => expert.role_name && expert.viewpoint && expert.request,
    );

    if (completedExperts.length === 0) {
      setExpertErrorMessage("確定する専門家ロールを1件以上入力してください。");
      return;
    }

    setConfirmedExperts(completedExperts);
    setExpertComments([]);
    setExpertErrorMessage("");
    saveConfirmedExpertDrafts(completedExperts);
  }

  async function generateExpertComments() {
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
      const comments = await Promise.all(
        confirmedExperts.map(async (expert) => {
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

      setExpertComments(comments);
      await carryResearchNeedsToMemo(comments, "direction");
      showInterruptionOptionsIfPaused();
    } catch (error) {
      setExpertErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
    } finally {
      setIsGeneratingExperts(false);
    }
  }

  async function generateFinalMarkdown() {
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

  async function carryResearchNeedsToMemo(
    comments: ExpertComment[],
    targetPhase: Phase,
  ) {
    const openQuestionItems = comments.flatMap((comment) => {
      const items: string[] = [];
      const questionToUser = comment.question_to_user.trim();

      if (comment.needs_research) {
        items.push(`${comment.role_name}: ${comment.concern}`);
      }

      if (questionToUser !== "なし") {
        items.push(`${comment.role_name}: ${questionToUser}`);
      }

      return items;
    });

    if (!response) return;

    setCurrentPhase(targetPhase);
    const nextResponse = {
      ...response,
      current_phase: targetPhase,
      memo_updates: {
        ...response.memo_updates,
        expert_summaries: replaceExpertMemoItems(
          response.memo_updates.expert_summaries,
          comments.map((comment) => comment.role_name),
          comments.map(formatExpertMemoSummary),
        ),
        open_questions: replaceExpertMemoItems(
          response.memo_updates.open_questions,
          comments.map((comment) => comment.role_name),
          openQuestionItems,
        ),
      },
    };

    const responseWithMemo = await updateSessionMemoForResponse(
      nextResponse,
      targetPhase,
      comments,
    );

    setResponse(responseWithMemo);
    setResponseHistory((current) => ({
      ...current,
      [targetPhase]: responseWithMemo,
    }));
  }

  async function updateSessionMemoForResponse(
    facilitatorResponse: FacilitatorResponse,
    targetPhase: Phase,
    comments: ExpertComment[] = [],
    userAction?: string,
  ) {
    setIsUpdatingMemo(true);
    setMemoErrorMessage("");

    const request: SessionMemoRequest = {
      consultation: sessionConsultation,
      currentPhase: targetPhase,
      previousMemo: memo ?? undefined,
      facilitatorResponse,
      expertComments: comments.length > 0 ? comments : undefined,
      userAction,
    };

    try {
      const apiResponse = await fetch("/api/session-memo/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await apiResponse.json();

      if (!apiResponse.ok) {
        setMemoErrorMessage(body.message ?? invalidGenerationMessage);
        return facilitatorResponse;
      }

      setMemoNotice("メモを更新しました。");
      return {
        ...facilitatorResponse,
        memo_updates: body as SessionMemo,
      };
    } catch (error) {
      setMemoErrorMessage(
        error instanceof Error
          ? error.message
          : "セッションメモの更新に失敗しました。",
      );
      return facilitatorResponse;
    } finally {
      setIsUpdatingMemo(false);
    }
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
    if (option === "その他") {
      setSelectedInterruptionOption(option);
      return;
    }

    setSelectedInterruptionOption(option);
    setInterruptionOtherAnswer("");
    setIsInterruptionReady(false);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setMemoNotice("選択内容を確認しました。次の整理で反映してください。");
  }

  function submitInterruptionOther() {
    const answer = emptyToUndefined(interruptionOtherAnswer);
    if (!answer) return;

    chooseInterruptionOption(answer);
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

  function clearExpertMemoItems(roleNames: string[]) {
    if (roleNames.length === 0) return;

    const clearFromResponse = (currentResponse: FacilitatorResponse) => ({
      ...currentResponse,
      memo_updates: {
        ...currentResponse.memo_updates,
        expert_summaries: replaceExpertMemoItems(
          currentResponse.memo_updates.expert_summaries,
          roleNames,
          [],
        ),
        open_questions: replaceExpertMemoItems(
          currentResponse.memo_updates.open_questions,
          roleNames,
          [],
        ),
      },
    });

    setResponse((currentResponse) => {
      return currentResponse
        ? clearFromResponse(currentResponse)
        : currentResponse;
    });
    setResponseHistory((current) => {
      return Object.fromEntries(
        Object.entries(current).map(([phase, currentResponse]) => {
          return [
            phase,
            currentResponse
              ? clearFromResponse(currentResponse)
              : currentResponse,
          ];
        }),
      ) as Partial<Record<Phase, FacilitatorResponse>>;
    });
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
                  isLoading || isGeneratingExperts || isGeneratingFinalMarkdown
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
                    disabled={isLoading}
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

              {response.expert_requests.length > 0 && (
                <section
                  className="expert-request-box"
                  aria-label="専門家ロール候補"
                >
                  <h3>専門家ロール候補</h3>
                  <div className="expert-request-list">
                    {expertDrafts.map((expertRequest, index) => (
                      <article
                        className="expert-request-item"
                        key={`${expertRequest.role_name}-${expertRequest.viewpoint}-${index}`}
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
                            disabled={isGeneratingExperts}
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
                            disabled={isGeneratingExperts}
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
                            disabled={isGeneratingExperts}
                          />
                        </label>
                        <div className="expert-row-actions">
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => replaceExpertDraft(index)}
                            disabled={isGeneratingExperts}
                          >
                            入れ替え
                          </button>
                          <button
                            className="text-button danger"
                            type="button"
                            onClick={() => removeExpertDraft(index)}
                            disabled={isGeneratingExperts}
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
                      disabled={isGeneratingExperts}
                    >
                      専門家を追加する
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={confirmExpertDrafts}
                      disabled={isGeneratingExperts}
                    >
                      おまかせで進める
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={confirmExpertDrafts}
                      disabled={isGeneratingExperts}
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
                        disabled={isGeneratingExperts}
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
                        disabled={isLoading}
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
                        disabled={isLoading}
                      />
                    </label>
                  )}
                  <div className="action-row">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={respondToQuestion}
                      disabled={isLoading}
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
                      />
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={submitInterruptionOther}
                      >
                        反映する
                      </button>
                    </label>
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
                      isUpdatingMemo ||
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
                  isUpdatingMemo ||
                  isGeneratingExperts ||
                  isGeneratingFinalMarkdown
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
              {isUpdatingMemo && <span>メモ更新中...</span>}
            </div>
            {memoNotice && <p className="notice">{memoNotice}</p>}
            {memoErrorMessage && <p className="error">{memoErrorMessage}</p>}
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

function replaceExpertMemoItems(
  items: string[],
  roleNames: string[],
  nextItems: string[],
) {
  const rolePrefixes = new Set(roleNames.map((roleName) => `${roleName}:`));

  return [
    ...items.filter((item) => {
      return !Array.from(rolePrefixes).some((prefix) =>
        item.startsWith(prefix),
      );
    }),
    ...nextItems,
  ];
}

function formatExpertMemoSummary(comment: ExpertComment) {
  return [
    `${comment.role_name}: ${comment.summary}`,
    `最重要ポイント: ${comment.key_point}`,
    `懸念・不明点: ${comment.concern}`,
  ].join(" / ");
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
