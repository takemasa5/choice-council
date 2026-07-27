import type {
  FinalMemoStatus,
  FacilitatorTurn,
  GroupChatMessage,
} from "../../shared/schemas/session";
import { finalMemoStatusOptions } from "../final-memo-flow";
import { type CSSProperties, useState } from "react";

function getExpertAvatarText(roleName: string) {
  return Array.from(roleName.trim()).slice(0, 2).join("") || "専";
}

function getExpertAvatarIdentifier(participantId: string) {
  let hash = 2166136261;

  for (const character of participantId) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  }

  return (hash >>> 0).toString(36).slice(-3).padStart(3, "0").toUpperCase();
}

function getExpertAvatarStyle(participantId: string): CSSProperties {
  const hue = Array.from(participantId).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) % 360,
    0,
  );

  return { "--expert-avatar-hue": hue } as CSSProperties;
}

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
      <div
        className="group-chat-timeline"
        role="log"
        aria-label="意見交換の発言履歴"
        aria-live="polite"
      >
        {messages.map((message) => {
          const expertIdentifier =
            message.speakerType === "expert"
              ? getExpertAvatarIdentifier(message.participantId)
              : null;

          return (
            <article
              className={`group-chat-message group-chat-message--${message.speakerType}`}
              key={message.id}
            >
              {message.speakerType === "facilitator" && (
                <span
                  className="group-chat-avatar group-chat-avatar--facilitator"
                  aria-hidden="true"
                >
                  司
                </span>
              )}
              {message.speakerType === "expert" && (
                <span
                  className="expert-avatar"
                  aria-label={`${message.speakerName}、専門家識別子${expertIdentifier}`}
                  role="img"
                  style={getExpertAvatarStyle(message.participantId)}
                >
                  <span aria-hidden="true">
                    {getExpertAvatarText(message.speakerName)}
                  </span>
                  <span className="expert-avatar-identifier" aria-hidden="true">
                    {expertIdentifier}
                  </span>
                </span>
              )}
              <div className="group-chat-message-body">
                <header className="group-chat-message-header">
                  {message.speakerType === "user" ? (
                    <span className="group-chat-message-label">あなた</span>
                  ) : (
                    <strong>
                      {message.speakerType === "facilitator"
                        ? "ファシリテーター"
                        : message.speakerName}
                    </strong>
                  )}
                </header>
                <p>{message.content}</p>
              </div>
              {message.speakerType === "user" && (
                <span
                  className="group-chat-avatar group-chat-avatar--user"
                  aria-hidden="true"
                >
                  あ
                </span>
              )}
            </article>
          );
        })}
        <article className="group-chat-message group-chat-message--facilitator group-chat-question">
          <span
            className="group-chat-avatar group-chat-avatar--facilitator"
            aria-hidden="true"
          >
            司
          </span>
          <div className="group-chat-message-body">
            <header className="group-chat-message-header">
              <strong>ファシリテーター</strong>
            </header>
            <p>
              <span className="group-chat-question-label">質問</span>
              {turn.question}
            </p>
          </div>
        </article>
      </div>
      {turn.requestedSpeaker.speakerType === "user" && (
        <div className="group-chat-answer-controls">
          {turn.userOptions && (
            <div className="group-chat-option-grid">
              {turn.userOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => onUserAnswer(option)}
                  disabled={isLoading}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="group-chat-free-response">
            <label className="field">
              <span>自由入力</span>
              <textarea
                value={otherAnswer}
                onChange={(event) => onOtherAnswerChange(event.target.value)}
                rows={3}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => onUserAnswer(otherAnswer.trim())}
              disabled={isLoading || !otherAnswer.trim()}
            >
              回答を送る
            </button>
          </div>
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
