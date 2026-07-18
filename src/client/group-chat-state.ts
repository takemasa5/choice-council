import type {
  FacilitatorTurn,
  GroupChatMessage,
} from "../shared/schemas/session";

/** LLM に渡す直近発言数。累積要約と併用して会話履歴の無制限な増加を防ぐ。 */
const recentMessageLimit = 6;

/** 日本語名: LLM 呼び出し用に直近発言だけを取り出す。仕様対応: `docs/tasks/milestone-4.md#セッションメモと会話文脈`。 */
export function getRecentGroupChatMessages(messages: GroupChatMessage[]) {
  return messages.slice(-recentMessageLimit);
}

/** 日本語名: グループチャットの画面状態。仕様対応: `docs/tasks/milestone-4.md#前提と遷移`。 */
export type GroupChatState = {
  messages: GroupChatMessage[];
  turn: FacilitatorTurn | null;
  contextSummary: string;
  otherAnswer: string;
  expertRepliesSinceUser: number;
};

/** 日本語名: グループチャット状態の初期値。 */
export const initialGroupChatState: GroupChatState = {
  messages: [],
  turn: null,
  contextSummary: "",
  otherAnswer: "",
  expertRepliesSinceUser: 0,
};

/** 日本語名: グループチャット状態を更新する操作。 */
export type GroupChatAction =
  | { type: "restore"; state: Partial<GroupChatState> }
  | { type: "reset" }
  | {
      type: "set_turn";
      messages: GroupChatMessage[];
      turn: FacilitatorTurn;
      contextSummary: string;
      expertRepliesSinceUser: number;
    }
  | { type: "set_other_answer"; value: string };

/** 日本語名: 非同期処理からの状態更新を一貫させるグループチャット reducer。 */
export function groupChatReducer(
  state: GroupChatState,
  action: GroupChatAction,
): GroupChatState {
  switch (action.type) {
    case "restore":
      return { ...initialGroupChatState, ...action.state };
    case "reset":
      return initialGroupChatState;
    case "set_turn":
      return {
        ...state,
        messages: action.messages,
        turn: action.turn,
        contextSummary: action.contextSummary,
        expertRepliesSinceUser: action.expertRepliesSinceUser,
      };
    case "set_other_answer":
      return { ...state, otherAnswer: action.value };
  }
}
