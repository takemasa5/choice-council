import type { FacilitatorResponse } from "../../shared/schemas/session";
import { canProceedToExpertSelection } from "../facilitator-flow";
import { PremisePhase } from "./PremisePhase";

/** 日本語名: 前提整理の回答状態と遷移操作を画面コンポーネントへ接続する。 */
export function PremisePhaseConnection({
  response,
  isBusy,
  selectedOption,
  otherAnswer,
  errorMessage,
  canRetry,
  selectOption,
  changeOtherAnswer,
  submitAnswer,
  proceedToExpertSelection,
  retry,
}: {
  response: FacilitatorResponse | null;
  isBusy: boolean;
  selectedOption: string;
  otherAnswer: string;
  errorMessage: string;
  canRetry: boolean;
  selectOption: (value: string) => void;
  changeOtherAnswer: (value: string) => void;
  submitAnswer: () => Promise<void>;
  proceedToExpertSelection: () => void;
  retry: () => Promise<void>;
}) {
  return (
    <PremisePhase
      canProceed={Boolean(response && canProceedToExpertSelection(response))}
      isBusy={isBusy}
      onProceed={proceedToExpertSelection}
      question={response?.user_question}
      selectedOption={selectedOption}
      otherAnswer={otherAnswer}
      onSelectOption={selectOption}
      onOtherAnswerChange={changeOtherAnswer}
      onSubmitAnswer={() => void submitAnswer()}
      errorMessage={errorMessage}
      canRetry={canRetry}
      onRetry={() => void retry()}
    />
  );
}
