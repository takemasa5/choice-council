import type { ExpertComment } from "../../shared/schemas/session";

/** 日本語名: 専門家コメントを確認して意見交換を開始するフェーズUI。 */
export function DeliberationPhase({
  expertComments,
  isStarting,
  errorMessage,
  onStart,
}: {
  expertComments: ExpertComment[];
  isStarting: boolean;
  errorMessage: string;
  onStart: () => void;
}) {
  if (expertComments.length === 0) return null;

  return (
    <section className="expert-comment-box" aria-label="専門家コメント">
      <h3>専門家コメント</h3>
      <div className="expert-comment-list">
        {expertComments.map((comment) => (
          <article
            className="expert-comment-item"
            key={`${comment.role_name}-${comment.viewpoint}`}
          >
            <div className="expert-comment-header">
              <strong>{comment.role_name}</strong>
              <span>{comment.confidence}</span>
            </div>
            <p>{comment.summary}</p>
            <dl>
              <div>
                <dt>最重要ポイント</dt>
                <dd>{comment.key_point}</dd>
              </div>
              <div>
                <dt>懸念・不明点</dt>
                <dd>{comment.concern}</dd>
              </div>
              <div>
                <dt>質問</dt>
                <dd>{comment.question_to_user}</dd>
              </div>
            </dl>
            {comment.needs_research && (
              <p className="research-note">
                未確認事項として後続整理へ渡します。
              </p>
            )}
          </article>
        ))}
      </div>
      <button
        className="primary-button"
        type="button"
        onClick={onStart}
        disabled={isStarting}
      >
        {isStarting ? "意見交換を開始中..." : "意見交換をはじめる"}
      </button>
      {errorMessage && <p className="error">{errorMessage}</p>}
    </section>
  );
}
