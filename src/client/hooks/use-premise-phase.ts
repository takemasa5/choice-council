import { useState } from "react";
import type { FacilitatorResponse, Phase } from "../../shared/schemas/session";
import type { FacilitatorResponseInput } from "../facilitator-flow";

/** 日本語名: 前提整理の質問回答で使う入力状態を管理するHook。 */
export function usePremisePhase({
  consultation,
  currentPhase,
  response,
  onSubmitRequest,
  onValidationError,
}: {
  consultation: string;
  currentPhase: Phase;
  response: FacilitatorResponse | null;
  onSubmitRequest: (input: FacilitatorResponseInput) => Promise<void>;
  onValidationError: (message: string) => void;
}) {
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

  /** 日本語名: 入力済みの必須質問回答を前提整理通信へ送信する。 */
  async function submitAnswer() {
    const question = response?.user_question;
    const memo = response?.memo_updates;
    const answer = getAnswer(response);
    if (!question || !memo || currentPhase !== "premise") return;
    if (!answer) {
      onValidationError("質問に回答してください。");
      return;
    }
    await onSubmitRequest({
      consultation,
      currentPhase,
      userQuestion: question,
      userQuestionAnswer: answer,
      memo,
    });
  }

  return {
    selectedQuestionOption,
    selectQuestionOption: setSelectedQuestionOption,
    otherQuestionAnswer,
    changeOtherQuestionAnswer: setOtherQuestionAnswer,
    clearQuestionAnswer: () => {
      setSelectedQuestionOption("");
      setOtherQuestionAnswer("");
    },
    restoreQuestionAnswer: (
      answer: string | undefined,
      response: FacilitatorResponse | null,
    ) => {
      const question = response?.user_question;
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
    },
    getAnswer,
    submitAnswer,
  };
}
