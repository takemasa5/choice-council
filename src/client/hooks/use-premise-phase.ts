import { useState } from "react";

/** 日本語名: 前提整理の質問回答で使う入力状態を管理するHook。 */
export function usePremisePhase() {
  const [selectedQuestionOption, setSelectedQuestionOption] = useState("");
  const [otherQuestionAnswer, setOtherQuestionAnswer] = useState("");

  return {
    selectedQuestionOption,
    setSelectedQuestionOption,
    otherQuestionAnswer,
    setOtherQuestionAnswer,
  };
}
