import type {
  ExpertComment,
  ExpertRequest,
  FinalMemoStatus,
  GroupChatMessage,
  FacilitatorTurn,
  SessionMemo,
} from "../../shared/schemas/session";
import { getRecentGroupChatMessages } from "../group-chat-context";
import { GroupChatPhase } from "./GroupChatPhase";

type GroupChatContext = {
  consultation: string;
  memo: SessionMemo | null;
  confirmedExperts: ExpertRequest[];
};

/** 日本語名: 意見交換の送信・再試行・終了メモ操作を画面コンポーネントへ接続する。 */
export function GroupChatPhaseConnection({
  turn,
  messages,
  otherAnswer,
  isLoading,
  isNextTurnRetryPending,
  errorMessage,
  context,
  expertComments,
  contextSummary,
  finishErrorMessage,
  changeOtherAnswer,
  submitUserAnswer,
  retryExpertReply,
  retryNextTurn,
  finish,
}: {
  turn: FacilitatorTurn | null;
  messages: GroupChatMessage[];
  otherAnswer: string;
  isLoading: boolean;
  isNextTurnRetryPending: boolean;
  errorMessage: string;
  context: GroupChatContext;
  expertComments: ExpertComment[];
  contextSummary: string;
  finishErrorMessage: string;
  changeOtherAnswer: (value: string) => void;
  submitUserAnswer: (
    input: GroupChatContext & { answer: string },
  ) => Promise<void>;
  retryExpertReply: (input: GroupChatContext) => Promise<void>;
  retryNextTurn: (input: GroupChatContext) => Promise<void>;
  finish: (input: {
    consultation: string;
    memo: SessionMemo | null;
    status: FinalMemoStatus;
    expertComments: ExpertComment[];
    contextSummary: string;
    recentMessages: GroupChatMessage[];
  }) => Promise<void>;
}) {
  return (
    <GroupChatPhase
      turn={turn}
      messages={messages}
      otherAnswer={otherAnswer}
      isLoading={isLoading}
      isNextTurnRetryPending={isNextTurnRetryPending}
      errorMessage={errorMessage}
      onOtherAnswerChange={changeOtherAnswer}
      onUserAnswer={(answer) => void submitUserAnswer({ ...context, answer })}
      onRetryExpertReply={() => void retryExpertReply(context)}
      onRetryNextTurn={() => void retryNextTurn(context)}
      finishErrorMessage={finishErrorMessage}
      onFinish={(status) =>
        void finish({
          consultation: context.consultation,
          memo: context.memo,
          status,
          expertComments,
          contextSummary,
          recentMessages: getRecentGroupChatMessages(messages),
        })
      }
    />
  );
}
