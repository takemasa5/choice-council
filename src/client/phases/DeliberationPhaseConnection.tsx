import type {
  DiscussionSelection,
  ExpertComment,
  ExpertRequest,
  SessionMemo,
} from "../../shared/schemas/session";
import { DeliberationPhase } from "./DeliberationPhase";

/** 日本語名: 検討フェーズのコメント表示と意見交換開始フローを接続する。 */
export function DeliberationPhaseConnection({
  consultation,
  memo,
  confirmedExperts,
  expertComments,
  discussionSelection,
  selectedProposalIds,
  isStarting,
  expertErrorMessage,
  startErrorMessage,
  toggleProposal,
  selectDeepDive,
  selectComparison,
  selectDefer,
  start,
  retryStart,
}: {
  consultation: string;
  memo: SessionMemo | null;
  confirmedExperts: ExpertRequest[];
  expertComments: ExpertComment[];
  discussionSelection: DiscussionSelection | null;
  selectedProposalIds: string[];
  isStarting: boolean;
  expertErrorMessage: string;
  startErrorMessage: string;
  toggleProposal: (proposalId: string) => void;
  selectDeepDive: () => void;
  selectComparison: () => void;
  selectDefer: () => void;
  start: (input: {
    consultation: string;
    memo: SessionMemo | null;
    confirmedExperts: ExpertRequest[];
    expertComments: ExpertComment[];
    discussionSelection: DiscussionSelection | null;
  }) => Promise<void>;
  retryStart: () => Promise<void>;
}) {
  return (
    <DeliberationPhase
      expertComments={expertComments}
      discussionSelection={discussionSelection}
      selectedProposalIds={selectedProposalIds}
      isStarting={isStarting}
      errorMessage={expertErrorMessage}
      startErrorMessage={startErrorMessage}
      onToggleProposal={toggleProposal}
      onSelectDeepDive={selectDeepDive}
      onSelectComparison={selectComparison}
      onSelectDefer={selectDefer}
      onStart={() =>
        void start({
          consultation,
          memo,
          confirmedExperts,
          expertComments,
          discussionSelection,
        })
      }
      onRetryStart={() => void retryStart()}
    />
  );
}
