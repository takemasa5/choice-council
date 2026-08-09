import type {
  DiscussionSelection,
  ExpertComment,
} from "../../shared/schemas/session";

/** 日本語名: 専門家コメントを確認して意見交換を開始するフェーズUI。 */
export function DeliberationPhase({
  expertComments,
  discussionSelection,
  selectedProposalIds,
  isStarting,
  errorMessage,
  startErrorMessage,
  onToggleProposal,
  onSelectDeepDive,
  onSelectComparison,
  onSelectDefer,
  onStart,
  onRetryStart,
}: {
  expertComments: ExpertComment[];
  discussionSelection: DiscussionSelection | null;
  selectedProposalIds: string[];
  isStarting: boolean;
  errorMessage: string;
  startErrorMessage: string;
  onToggleProposal: (proposalId: string) => void;
  onSelectDeepDive: () => void;
  onSelectComparison: () => void;
  onSelectDefer: () => void;
  onStart: () => void;
  onRetryStart: () => void;
}) {
  if (expertComments.length === 0) return null;

  return (
    <section className="expert-comment-box" aria-label="専門家コメント">
      <h3>専門家コメント</h3>
      <div className="expert-comment-list">
        {expertComments.map((comment) => {
          const isProposalSelected = selectedProposalIds.includes(
            comment.proposal.id,
          );

          return (
            <article
              className="expert-comment-item"
              key={`${comment.role_name}-${comment.viewpoint}`}
            >
              <div className="expert-comment-header">
                <strong>{comment.role_name}</strong>
                <span>{comment.confidence}</span>
              </div>
              <p>{comment.summary}</p>
              <section
                className="expert-proposal"
                aria-label={`${comment.proposal.name}の詳細`}
              >
                <div className="expert-proposal-header">
                  <h4>{comment.proposal.name}</h4>
                  <label
                    className={`expert-proposal-selection${
                      isProposalSelected
                        ? " expert-proposal-selection--selected"
                        : ""
                    }${isStarting ? " expert-proposal-selection--disabled" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isProposalSelected}
                      onChange={() => onToggleProposal(comment.proposal.id)}
                      disabled={isStarting}
                    />
                    比較対象に選ぶ
                  </label>
                </div>
                <p>{comment.proposal.content}</p>
                <dl>
                  <div>
                    <dt>利点</dt>
                    <dd>{comment.proposal.benefits.join("、")}</dd>
                  </div>
                  <div>
                    <dt>犠牲にする点</dt>
                    <dd>{comment.proposal.sacrifices.join("、")}</dd>
                  </div>
                  <div>
                    <dt>成立条件</dt>
                    <dd>{comment.proposal.conditions.join("、")}</dd>
                  </div>
                </dl>
              </section>
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
          );
        })}
      </div>
      <section
        className="proposal-selection"
        aria-label="意見交換の起点となる案の選択"
      >
        <h4>次に検討する案を選ぶ</h4>
        <p>専門家ではなく、上の具体案を選択してください。</p>
        {discussionSelection && (
          <p className="notice">
            現在の選択: {getSelectionLabel(discussionSelection)}
          </p>
        )}
        <div className="expert-actions proposal-selection-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onSelectDeepDive}
            disabled={isStarting || selectedProposalIds.length !== 1}
          >
            1案を深掘りする
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onSelectComparison}
            disabled={isStarting || selectedProposalIds.length !== 2}
          >
            2案を比較する
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onSelectDefer}
            disabled={isStarting}
          >
            まだ選ばない
          </button>
        </div>
        <button
          className="primary-button proposal-selection-start-button"
          type="button"
          onClick={onStart}
          disabled={isStarting || !discussionSelection}
        >
          {isStarting
            ? "意見交換を開始中..."
            : "選択した内容で意見交換をはじめる"}
        </button>
      </section>
      {errorMessage && <p className="error">{errorMessage}</p>}
      {startErrorMessage && (
        <>
          <p className="error">{startErrorMessage}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={onRetryStart}
            disabled={isStarting}
          >
            意見交換の開始を再試行する
          </button>
        </>
      )}
    </section>
  );
}

function getSelectionLabel(selection: DiscussionSelection) {
  if (selection.kind === "deep_dive") return "1案を深掘り";
  if (selection.kind === "compare") return "2案を比較";
  return "まだ選ばない";
}
