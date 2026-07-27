import assert from "node:assert/strict";
import test from "node:test";
import {
  FacilitatorTurnSchema,
  GroupChatStartTurnSchema,
} from "../../../src/shared/schemas/session";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

const expert = {
  participantId: "financial-adviser",
  role_name: "家計アドバイザー",
  viewpoint: "費用",
  request: "費用面を検討してください",
};
const comment = {
  role_name: expert.role_name,
  viewpoint: expert.viewpoint,
  summary: "費用を確認します。",
  key_point: "予算",
  concern: "支出",
  question_to_user: "予算はありますか。",
  confidence: "medium",
  needs_research: false,
} as const;
const turn = {
  message: "家計アドバイザーに伺います。",
  requestedSpeaker: {
    speakerType: "expert",
    speakerName: expert.role_name,
    participantId: expert.participantId,
  },
  requestReason: "費用面を深掘りするためです。",
  question: "予算の考え方を教えてください。",
  userOptions: null,
  memoUpdate: null,
  contextSummaryUpdate: "費用を検討中です。",
} as const;

const userTurn = {
  ...turn,
  requestedSpeaker: {
    speakerType: "user",
    speakerName: "あなた",
    participantId: "user",
  },
  userOptions: ["費用を優先して検討したい", "そのまま意見交換を続けて"],
} as const;

test("POST /api/facilitator/group-chat/start は厳密なターンを返す", async () => {
  let structuredRequest: unknown;
  const response = await requestJson(
    createTestApp(turn, "test-api-key", (request) => {
      structuredRequest = request;
    }),
    "/api/facilitator/group-chat/start",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      confirmedExperts: [expert],
      initialExpertComments: [comment],
    },
  );
  assert.equal(response.status, 200);
  assert.equal(
    (response.body as typeof turn).requestedSpeaker.speakerType,
    "expert",
  );
  assert.equal(
    (structuredRequest as { schemaName: string }).schemaName,
    "group_chat_start_turn",
  );
  assert.equal(GroupChatStartTurnSchema.safeParse(turn).success, true);
  assert.equal(
    GroupChatStartTurnSchema.safeParse({
      ...turn,
      requestedSpeaker: {
        speakerType: "user",
        speakerName: "あなた",
        participantId: "user",
      },
      userOptions: ["その他", "そのまま意見交換を続けて"],
    }).success,
    false,
  );
});

test("POST /api/facilitator/group-chat/next は無効な発言者種別を再試行後に拒否する", async () => {
  const invalidTurn = {
    ...turn,
    requestedSpeaker: { ...turn.requestedSpeaker, speakerType: "facilitator" },
  };
  const response = await requestJson(
    createTestApp([invalidTurn, invalidTurn]),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 1,
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/facilitator/group-chat/next は専門家の連続3回目を拒否する", async () => {
  const response = await requestJson(
    createTestApp([turn, turn]),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 2,
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/facilitator/group-chat/next は条件を満たすユーザーターンを返す", async () => {
  const response = await requestJson(
    createTestApp(userTurn),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 2,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body as typeof userTurn).userOptions,
    userTurn.userOptions,
  );
  assert.equal(FacilitatorTurnSchema.safeParse(userTurn).success, true);
});

test("POST /api/facilitator/group-chat/next はその他を含むユーザーターンを再試行後に拒否する", async () => {
  const invalidUserTurn = {
    ...userTurn,
    userOptions: ["その他", "そのまま意見交換を続けて"],
  };
  const response = await requestJson(
    createTestApp([invalidUserTurn, invalidUserTurn]),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 2,
    },
  );

  assert.equal(response.status, 502);
  assert.equal(FacilitatorTurnSchema.safeParse(invalidUserTurn).success, false);
});

test("POST /api/facilitator/group-chat/next は直近発言の上限を超える入力を拒否する", async () => {
  const recentMessages = Array.from({ length: 9 }, (_, index) => ({
    id: `message-${index + 1}`,
    speakerType: "user" as const,
    speakerName: "あなた",
    participantId: "user",
    content: `発言 ${index + 1}`,
    createdAt: "2026-07-26T00:00:00.000Z",
  }));
  const response = await requestJson(
    createTestApp(turn),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages,
      confirmedExperts: [expert],
      expertRepliesSinceUser: 1,
    },
  );

  assert.equal(response.status, 400);
});

test("POST /api/facilitator/group-chat/start は未確定専門家の指名を拒否する", async () => {
  const invalidTurn = {
    ...turn,
    requestedSpeaker: { ...turn.requestedSpeaker, participantId: "unknown" },
  };
  const response = await requestJson(
    createTestApp([invalidTurn, invalidTurn]),
    "/api/facilitator/group-chat/start",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      confirmedExperts: [expert],
      initialExpertComments: [comment],
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/expert/group-chat は専門家として発言を返し未知の入力を拒否する", async () => {
  const reply = {
    id: "reply-1",
    speakerType: "user",
    speakerName: "誤り",
    participantId: "wrong",
    content: "予算を確認します。",
    createdAt: "2026-07-18T00:00:00.000Z",
  };
  const request = {
    consultation: "相談内容",
    currentPhase: "group_chat",
    memo,
    contextSummary: "費用を検討中です。",
    recentMessages: [],
    expert,
    facilitatorQuestion: "予算の考え方を教えてください。",
  };
  const response = await requestJson(
    createTestApp(reply),
    "/api/expert/group-chat",
    request,
  );
  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { speakerType: string }).speakerType,
    "expert",
  );
  const invalidResponse = await requestJson(
    createTestApp(reply),
    "/api/expert/group-chat",
    { ...request, unexpected: true },
  );
  assert.equal(invalidResponse.status, 400);
});
