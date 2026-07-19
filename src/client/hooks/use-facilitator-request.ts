import { useState } from "react";
import type { FailedFacilitatorRequest } from "../facilitator-flow";

/** 日本語名: 相談開始・前提回答で共有する通信状態と再試行対象を管理するHook。 */
export function useFacilitatorRequest() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedRequest, setFailedRequest] =
    useState<FailedFacilitatorRequest | null>(null);

  /** 日本語名: ファシリテーターAPIへJSONを送信し、HTTP結果とJSON応答を返す通信操作。 */
  async function post(path: string, request: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return { ok: response.ok, body: await response.json() };
  }

  /** 日本語名: 保持済みリクエストを同一内容で再送する操作。 */
  async function retry({
    onStart,
    onRespond,
  }: {
    onStart: (
      request: Extract<
        FailedFacilitatorRequest,
        { endpoint: "start" }
      >["request"],
    ) => Promise<void>;
    onRespond: (
      request: Exclude<
        FailedFacilitatorRequest,
        { endpoint: "start" }
      >["request"],
    ) => Promise<void>;
  }) {
    if (!failedRequest || isLoading) return;
    setErrorMessage("");
    if (failedRequest.endpoint === "start") {
      await onStart(failedRequest.request);
      return;
    }
    await onRespond(failedRequest.request);
  }

  return {
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    failedRequest,
    setFailedRequest,
    post,
    retry,
  };
}
