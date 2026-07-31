import type {
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
  isStarting,
  expertErrorMessage,
  startErrorMessage,
  start,
  retryStart,
}: {
  consultation: string;
  memo: SessionMemo | null;
  confirmedExperts: ExpertRequest[];
  expertComments: ExpertComment[];
  isStarting: boolean;
  expertErrorMessage: string;
  startErrorMessage: string;
  start: (input: {
    consultation: string;
    memo: SessionMemo | null;
    confirmedExperts: ExpertRequest[];
    expertComments: ExpertComment[];
  }) => Promise<void>;
  retryStart: () => Promise<void>;
}) {
  return (
    <DeliberationPhase
      expertComments={expertComments}
      isStarting={isStarting}
      errorMessage={expertErrorMessage}
      startErrorMessage={startErrorMessage}
      onStart={() =>
        void start({ consultation, memo, confirmedExperts, expertComments })
      }
      onRetryStart={() => void retryStart()}
    />
  );
}
