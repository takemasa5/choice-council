import type { FacilitatorResponse } from "../../shared/schemas/session";

/** 日本語名: 前提整理の質問回答と、専門家選定への遷移を表示するフェーズUI。 */
export function PremisePhase({
  canProceed,
  isBusy,
  onProceed,
  question,
  selectedOption,
  otherAnswer,
  onSelectOption,
  onOtherAnswerChange,
  onSubmitAnswer,
  errorMessage,
  canRetry,
  onRetry,
}: {
  canProceed: boolean;
  isBusy: boolean;
  onProceed: () => void;
  question: FacilitatorResponse["user_question"] | undefined;
  selectedOption: string;
  otherAnswer: string;
  onSelectOption: (value: string) => void;
  onOtherAnswerChange: (value: string) => void;
  onSubmitAnswer: () => void;
  errorMessage: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      {question && (
        <div className="question-box">
          <strong>{question.question}</strong>
          <div className="option-list">
            {question.options.map((option) => (
              <button
                type="button"
                key={option}
                className={selectedOption === option ? "selected" : undefined}
                onClick={() => onSelectOption(option)}
                disabled={isBusy}
              >
                {option}
              </button>
            ))}
          </div>
          {selectedOption === "その他" && (
            <label className="field inline-field">
              <span>自由入力</span>
              <textarea
                value={otherAnswer}
                onChange={(event) => onOtherAnswerChange(event.target.value)}
                rows={3}
                disabled={isBusy}
              />
            </label>
          )}
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={onSubmitAnswer}
              disabled={isBusy}
            >
              {isBusy ? "回答を整理中..." : "回答を送る"}
            </button>
          </div>
        </div>
      )}
      {canProceed && (
        <button
          className="primary-button"
          type="button"
          onClick={onProceed}
          disabled={isBusy}
        >
          専門家選定へ進む
        </button>
      )}
      {errorMessage && (
        <div className="error-block">
          <p className="error">{errorMessage}</p>
          {canRetry && (
            <button
              className="secondary-button"
              type="button"
              onClick={onRetry}
              disabled={isBusy}
            >
              {isBusy ? "リトライ中..." : "同じ内容でリトライ"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
