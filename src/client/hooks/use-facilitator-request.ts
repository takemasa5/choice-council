import { useState } from "react";
import type { FailedFacilitatorRequest } from "../facilitator-flow";

/** 日本語名: 相談開始・前提回答で共有する通信状態と再試行対象を管理するHook。 */
export function useFacilitatorRequest() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedRequest, setFailedRequest] =
    useState<FailedFacilitatorRequest | null>(null);

  return {
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    failedRequest,
    setFailedRequest,
  };
}
