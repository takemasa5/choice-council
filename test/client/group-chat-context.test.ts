import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroupChatDiscussionContext,
  getRecentGroupChatMessages,
} from "../../src/client/group-chat-context";
import { recentGroupChatMessageLimit } from "../../src/shared/schemas/session";

const messages = Array.from(
  { length: recentGroupChatMessageLimit + 2 },
  (_, index) => ({
    id: `message-${index + 1}`,
    speakerType: "user" as const,
    speakerName: "あなた",
    participantId: "user",
    content: `発言 ${index + 1}`,
    createdAt: "2026-07-26T00:00:00.000Z",
  }),
);

test("グループチャットのLLM文脈は直近8件だけを送る", () => {
  const recentMessages = getRecentGroupChatMessages(messages);

  assert.equal(recentMessages.length, recentGroupChatMessageLimit);
  assert.equal(recentMessages[0]?.id, "message-3");
  assert.equal(recentMessages.at(-1)?.id, "message-10");
});

test("保留時も開始後の検討文脈へ全初回案を渡す", () => {
  const comments = ["proposal-1", "proposal-2"].map((id) => ({
    role_name: `専門家${id}`,
    viewpoint: "観点",
    summary: "要約",
    proposal: {
      id,
      name: `案${id}`,
      content: "内容",
      benefits: ["利点"],
      sacrifices: ["犠牲"],
      conditions: ["条件"],
    },
    key_point: "要点",
    concern: "懸念",
    question_to_user: "なし",
    confidence: "medium" as const,
    needs_research: false,
  }));

  const context = createGroupChatDiscussionContext(
    { kind: "defer" },
    comments,
    [
      { participantId: "expert-1", role_name: comments[0]?.role_name ?? "" },
      { participantId: "expert-2", role_name: comments[1]?.role_name ?? "" },
    ],
  );

  assert.deepEqual(
    context?.proposals.map((proposal) => ({
      participantId: proposal.participantId,
      proposalId: proposal.proposal.id,
    })),
    [
      { participantId: "expert-1", proposalId: "proposal-1" },
      { participantId: "expert-2", proposalId: "proposal-2" },
    ],
  );
});
