import { useState } from "react";
import type { FacilitatorResponse } from "../../shared/schemas/session";

/** 日本語名: 前提整理の質問回答で使う入力状態を管理するHook。 */
export function usePremisePhase() {
  const [selectedQuestionOption, setSelectedQuestionOption] = useState("");
  const [otherQuestionAnswer, setOtherQuestionAnswer] = useState("");

  /** 日本語名: 選択肢または自由入力から、送信可能な質問回答を取得する。 */
  function getAnswer(response: FacilitatorResponse | null) {
    if (!response?.user_question || !selectedQuestionOption) return undefined;
    if (selectedQuestionOption === "その他") {
      const trimmed = otherQuestionAnswer.trim();
      return trimmed || undefined;
    }
    return selectedQuestionOption;
  }

  return {
    selectedQuestionOption,
    setSelectedQuestionOption,
    otherQuestionAnswer,
    setOtherQuestionAnswer,
    getAnswer,
  };
}
