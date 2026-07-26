import { useState } from "react";
import type {
  ConsultationStartRequest,
  FacilitatorResponse,
  FacilitatorResponseRequest,
} from "../../shared/schemas/session";
import {
  buildConsultationStartRequest,
  buildFacilitatorResponseRequest,
  createFailedFacilitatorRequest,
  replaceMemoInFailedFacilitatorRequest,
  type ConsultationStartInput,
  type FacilitatorResponseInput,
  type FailedFacilitatorRequest,
} from "../facilitator-flow";
import type { SessionMemo } from "../../shared/schemas/session";

const invalidGenerationMessage =
  "この発言の生成に失敗しました。再生成できます。";

/** 日本語名: 相談開始と前提整理回答の通信・失敗・再試行を所有するフェーズフロー。 */
export function useFacilitatorPhaseFlow() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedRequest, setFailedRequest] =
    useState<FailedFacilitatorRequest | null>(null);
  const [retrySuccess, setRetrySuccess] = useState<
    | ((
        request: FailedFacilitatorRequest["request"],
        response: FacilitatorResponse,
      ) => void)
    | null
  >(null);

  async function start({
    input,
    onBeforeRequest,
    onSuccess,
  }: {
    input: ConsultationStartInput;
    onBeforeRequest: () => void;
    onSuccess: (
      request: ConsultationStartRequest,
      response: FacilitatorResponse,
    ) => void;
  }) {
    const request = buildConsultationStartRequest(input);
    if (isLoading) return;
    if (!request.consultation.trim()) {
      setFailedRequest(null);
      setRetrySuccess(null);
      setErrorMessage("相談内容を入力してください。");
      return;
    }

    onBeforeRequest();
    await send({
      path: "/api/facilitator/start",
      request,
      failed: createFailedFacilitatorRequest({ endpoint: "start", request }),
      onSuccess: (response) => onSuccess(request, response),
      onRetrySuccess: (retryRequest, response) =>
        onSuccess(retryRequest as ConsultationStartRequest, response),
    });
  }

  async function respond({
    input,
    onSuccess,
  }: {
    input: FacilitatorResponseInput;
    onSuccess: (response: FacilitatorResponse) => void;
  }) {
    const request = buildFacilitatorResponseRequest(input);
    if (isLoading || !request) return;
    await send({
      path: "/api/facilitator/respond",
      request,
      failed: createFailedFacilitatorRequest({ endpoint: "respond", request }),
      onSuccess,
      onRetrySuccess: (_, response) => onSuccess(response),
    });
  }

  async function retry() {
    if (isLoading || !failedRequest || !retrySuccess) return;
    setErrorMessage("");
    const retryTransport = getFacilitatorRetryTransport(failedRequest);
    await send({
      ...retryTransport,
      failed: failedRequest,
      onSuccess: (response) => retrySuccess(failedRequest.request, response),
      onRetrySuccess: retrySuccess,
    });
  }

  function clearFailure() {
    setErrorMessage("");
    setFailedRequest(null);
    setRetrySuccess(null);
  }

  /** 日本語名: メモ更新後も確認回答の再試行対象を最新メモへ同期する。 */
  function synchronizeRetryMemo(memo: SessionMemo) {
    setFailedRequest((current) =>
      replaceMemoInFailedFacilitatorRequest(current, memo),
    );
  }

  async function send({
    path,
    request,
    failed,
    onSuccess,
    onRetrySuccess,
  }: {
    path: string;
    request: ConsultationStartRequest | FacilitatorResponseRequest;
    failed: FailedFacilitatorRequest;
    onSuccess: (response: FacilitatorResponse) => void;
    onRetrySuccess: (
      request: FailedFacilitatorRequest["request"],
      response: FacilitatorResponse,
    ) => void;
  }) {
    setIsLoading(true);
    setErrorMessage("");
    setFailedRequest(null);
    setRetrySuccess(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isAcceptedResponse(body)) {
        const message = getErrorMessage(body);
        setErrorMessage(message);
        setFailedRequest(failed);
        setRetrySuccess(() => onRetrySuccess);
        return;
      }
      onSuccess(body);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "通信に失敗しました。",
      );
      setFailedRequest(failed);
      setRetrySuccess(() => onRetrySuccess);
    } finally {
      setIsLoading(false);
    }
  }

  return {
    isLoading,
    errorMessage,
    failedRequest,
    start,
    respond,
    retry,
    clearFailure,
    synchronizeRetryMemo,
    reportValidationError: (message: string) => {
      setFailedRequest(null);
      setRetrySuccess(null);
      setErrorMessage(message);
    },
  };
}

/** 日本語名: 最新の失敗リクエストから、同一内容の再送先と本文を作る。 */
export function getFacilitatorRetryTransport<
  FailedRequest extends FailedFacilitatorRequest,
>(
  failedRequest: FailedRequest,
): {
  path: FailedRequest["endpoint"] extends "start"
    ? "/api/facilitator/start"
    : "/api/facilitator/respond";
  request: FailedRequest["request"];
} {
  return {
    path:
      failedRequest.endpoint === "start"
        ? "/api/facilitator/start"
        : "/api/facilitator/respond",
    request: failedRequest.request,
  } as {
    path: FailedRequest["endpoint"] extends "start"
      ? "/api/facilitator/start"
      : "/api/facilitator/respond";
    request: FailedRequest["request"];
  };
}

function isAcceptedResponse(body: unknown): body is FacilitatorResponse {
  if (!body || typeof body !== "object" || !("current_phase" in body))
    return false;
  const response = body as FacilitatorResponse;
  if (response.current_phase !== "premise") return false;
  return response.user_question
    ? response.user_question.required && response.next_action === "wait_user"
    : response.next_action === "request_experts" &&
        response.expert_requests.length > 0;
}

function getErrorMessage(body: unknown) {
  if (body && typeof body === "object" && "current_phase" in body) {
    return "前提整理として受け入れられない応答が返されました。";
  }
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }
  return invalidGenerationMessage;
}
