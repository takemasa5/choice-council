import type {
  FinalMemoStatus,
  FacilitatorTurn,
  GroupChatMessage,
} from "../../shared/schemas/session";
import { finalMemoStatusOptions } from "../final-memo-flow";
import { useState } from "react";

/**
 * 日本語名: 意見交換のタイムライン、回答送信、再生成を表示するフェーズUI。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#完成イメージ`。
 */
export function GroupChatPhase({
  turn,
  messages,
  otherAnswer,
  isLoading,
  errorMessage,
  onOtherAnswerChange,
  onUserAnswer,
  onRetryExpertReply,
  finishErrorMessage,
  onFinish,
}: {
  turn: FacilitatorTurn | null;
  messages: GroupChatMessage[];
  otherAnswer: string;
  isLoading: boolean;
  errorMessage: string;
  onOtherAnswerChange: (value: string) => void;
  onUserAnswer: (answer: string) => void;
  onRetryExpertReply: () => void;
  finishErrorMessage: string;
  onFinish: (status: FinalMemoStatus) => void;
}) {
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const [selectedFinishStatus, setSelectedFinishStatus] =
    useState<FinalMemoStatus | null>(null);

  if (!turn) return null;

  return (
    <section className="expert-comment-box" aria-label="意見交換">
      <h3>意見交換</h3>
      {messages.map((message) => (
        <article className="expert-comment-item" key={message.id}>
          <strong>{message.speakerName}</strong>
          <p>{message.content}</p>
        </article>
      ))}
      <p>{turn.question}</p>
      {turn.requestedSpeaker.speakerType === "user" && turn.userOptions && (
        <div className="option-list">
          {turn.userOptions.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() =>
                option === "その他"
                  ? onOtherAnswerChange(" ")
                  : onUserAnswer(option)
              }
              disabled={isLoading}
            >
              {option}
            </button>
          ))}
          {otherAnswer && (
            <label className="field inline-field">
              <span>自由入力</span>
              <textarea
                value={otherAnswer.trim()}
                onChange={(event) => onOtherAnswerChange(event.target.value)}
                rows={3}
              />
              <button
                className="primary-button"
                type="button"
                onClick={() => onUserAnswer(otherAnswer)}
                disabled={isLoading}
              >
                回答を送る
              </button>
            </label>
          )}
        </div>
      )}
      {errorMessage && (
        <>
          <p className="error">{errorMessage}</p>
          {turn.requestedSpeaker.speakerType === "expert" && (
            <button
              className="secondary-button"
              type="button"
              onClick={onRetryExpertReply}
              disabled={isLoading}
            >
              専門家回答を再生成する
            </button>
          )}
        </>
      )}
      {finishErrorMessage && <p className="error">{finishErrorMessage}</p>}
      <button
        className="secondary-button"
        type="button"
        onClick={() => setIsFinishDialogOpen(true)}
        disabled={isLoading}
      >
        検討を終える
      </button>
      {isFinishDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsFinishDialogOpen(false)}
        >
          <section
            className="modal-dialog"
            aria-labelledby="finish-dialog-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h4 id="finish-dialog-title">終了状態を選択</h4>
            <p>意見交換をどの状態で終えるか選んでください。</p>
            <div className="option-list">
              {finalMemoStatusOptions.map((option) => (
                <button
                  type="button"
                  className={
                    selectedFinishStatus === option.status
                      ? "selected"
                      : undefined
                  }
                  key={option.status}
                  onClick={() => setSelectedFinishStatus(option.status)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                disabled={!selectedFinishStatus}
                onClick={() => {
                  if (!selectedFinishStatus) return;
                  setIsFinishDialogOpen(false);
                  onFinish(selectedFinishStatus);
                }}
              >
                終了状態を確定する
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setIsFinishDialogOpen(false)}
              >
                キャンセル
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
