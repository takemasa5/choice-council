import { useReducer, useState } from "react";
import { groupChatReducer, initialGroupChatState } from "../group-chat-state";

/**
 * 日本語名: 意見交換フェーズだけで使うreducer状態を管理するHook。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#状態と副作用の境界`。
 */
export function useGroupChatPhase() {
  const [state, dispatch] = useReducer(groupChatReducer, initialGroupChatState);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  return {
    state,
    dispatch,
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
  };
}
