import assert from "node:assert/strict";
import test from "node:test";
import { getRecentGroupChatMessages } from "../../src/client/group-chat-context";
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
