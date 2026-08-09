import {
  GroupChatDiscussionContextSchema,
  recentGroupChatMessageLimit,
  type DiscussionSelection,
  type ExpertComment,
  type GroupChatExpert,
  type GroupChatDiscussionContext,
  type GroupChatMessage,
} from "../shared/schemas/session";

/** LLM に渡すため、画面表示履歴から直近の会話文脈だけを取り出す。 */
export function getRecentGroupChatMessages(messages: GroupChatMessage[]) {
  return messages.slice(-recentGroupChatMessageLimit);
}

/** 選択内容と全初回案を、開始後のグループチャットへ渡す検討文脈へ整える。 */
export function createGroupChatDiscussionContext(
  selection: DiscussionSelection | null,
  expertComments: ExpertComment[],
  confirmedExperts: Array<Pick<GroupChatExpert, "participantId" | "role_name">>,
): GroupChatDiscussionContext | null {
  if (!selection || expertComments.length !== confirmedExperts.length) {
    return null;
  }

  const parsed = GroupChatDiscussionContextSchema.safeParse({
    selection,
    proposals: expertComments.map((comment, index) => ({
      participantId: confirmedExperts[index]?.participantId,
      roleName: confirmedExperts[index]?.role_name,
      proposal: comment.proposal,
    })),
  });
  return parsed.success ? parsed.data : null;
}
