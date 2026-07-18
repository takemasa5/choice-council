import type {
  FacilitatorTurn,
  GroupChatMessage,
} from "../../shared/schemas/session";

/**
 * 日本語名: 意見交換のタイムライン、回答送信、再生成を表示するフェーズUI。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#コンポーネント責務`。
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
}: {
  turn: FacilitatorTurn | null;
  messages: GroupChatMessage[];
  otherAnswer: string;
  isLoading: boolean;
  errorMessage: string;
  onOtherAnswerChange: (value: string) => void;
  onUserAnswer: (answer: string) => void;
  onRetryExpertReply: () => void;
}) {
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
    </section>
  );
}
