import {
  recentGroupChatMessageLimit,
  type GroupChatMessage,
} from "../shared/schemas/session";

/** LLM に渡すため、画面表示履歴から直近の会話文脈だけを取り出す。 */
export function getRecentGroupChatMessages(messages: GroupChatMessage[]) {
  return messages.slice(-recentGroupChatMessageLimit);
}
