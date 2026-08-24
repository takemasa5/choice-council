import assert from "node:assert/strict";
import test from "node:test";
import {
  ExpertGroupChatMessageSchema,
  FacilitatorTurnSchema,
  DiscussionSelectionSchema,
  GroupChatMessageSchema,
  GroupChatStartTurnSchema,
} from "../../../src/shared/schemas/session";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

const expert = {
  participantId: "financial-adviser",
  role_name: "家計アドバイザー",
  viewpoint: "費用",
  request: "費用面を検討してください",
};
const alternativeExpert = {
  participantId: "education-adviser",
  role_name: "教育アドバイザー",
  viewpoint: "子どもの納得感",
  request: "子どもの意欲を検討してください",
};
const comment = {
  role_name: expert.role_name,
  viewpoint: expert.viewpoint,
  summary: "費用を確認します。",
  proposal: {
    id: "proposal-budget",
    name: "予算を守る案",
    content: "予算上限を決めて候補を絞ります。",
    benefits: ["支出を管理しやすい"],
    sacrifices: ["候補が減る"],
    conditions: ["予算上限を決める"],
  },
  key_point: "予算",
  concern: "支出",
  question_to_user: "予算はありますか。",
  confidence: "medium",
  needs_research: false,
} as const;
const discussionProposal = {
  participantId: expert.participantId,
  roleName: expert.role_name,
  proposal: comment.proposal,
} as const;
const alternativeDiscussionProposal = {
  participantId: alternativeExpert.participantId,
  roleName: alternativeExpert.role_name,
  proposal: { ...comment.proposal, id: "proposal-experience" },
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

test("グループチャット出力は通常画面用の文字数とMarkdownを制限する", () => {
  const message = {
    id: "message-1",
    speakerType: "expert",
    speakerName: "専門家",
    participantId: "expert-1",
    content: "専門家の通常文です。# は許可する。",
    createdAt: "2026-08-11T00:00:00.000Z",
  } as const;

  assert.ok(ExpertGroupChatMessageSchema.safeParse(message).success);
  assert.equal(
    ExpertGroupChatMessageSchema.safeParse({
      ...message,
      content: "あ".repeat(201),
    }).success,
    false,
  );
  assert.equal(
    ExpertGroupChatMessageSchema.safeParse({
      ...message,
      content: "- 箇条書き",
    }).success,
    false,
  );
  const userMessage = GroupChatMessageSchema.safeParse({
    ...message,
    speakerType: "user",
    content: "A<B>C",
  });
  assert.ok(userMessage.success);
  assert.equal(userMessage.data.content, "A<B>C");

  assert.ok(
    GroupChatMessageSchema.safeParse({
      ...message,
      speakerType: "user",
      content: `**${"ユーザー入力".repeat(40)}**\n補足`,
    }).success,
  );

  assert.ok(FacilitatorTurnSchema.safeParse(turn).success);
  assert.ok(FacilitatorTurnSchema.safeParse(userTurn).success);
  for (const invalidTurn of [
    { ...turn, message: "あ".repeat(201) },
    { ...turn, requestReason: "# 見出し" },
    { ...turn, question: "1行目\n2行目" },
    {
      ...userTurn,
      userOptions: ["費用を優先して\n検討したい", "そのまま意見交換を続けて"],
    },
    {
      ...userTurn,
      userOptions: ["**費用を優先して検討したい**", "そのまま意見交換を続けて"],
    },
    {
      ...userTurn,
      userOptions: ["```費用を優先して検討したい", "そのまま意見交換を続けて"],
    },
    {
      ...userTurn,
      userOptions: ["あ".repeat(201), "そのまま意見交換を続けて"],
    },
  ]) {
    assert.equal(FacilitatorTurnSchema.safeParse(invalidTurn).success, false);
  }
  assert.equal(
    GroupChatStartTurnSchema.safeParse({
      ...turn,
      message: "```コードフェンス",
    }).success,
    false,
  );
});

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
      discussionSelection: { kind: "deep_dive", proposalId: "proposal-budget" },
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
  assert.deepEqual(
    (
      structuredRequest as {
        userInput: { discussionSelection: unknown };
      }
    ).userInput.discussionSelection,
    { kind: "deep_dive", proposalId: "proposal-budget" },
  );
  assert.equal(
    (
      structuredRequest as {
        userInput: { confirmedExperts: Array<{ participantId: string }> };
      }
    ).userInput.confirmedExperts[0]?.participantId,
    expert.participantId,
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

test("グループチャット開始は不完全または不正な案選択を拒否する", async () => {
  assert.equal(
    DiscussionSelectionSchema.safeParse({
      kind: "compare",
      proposalIds: ["proposal-budget"],
    }).success,
    false,
  );
  assert.equal(
    DiscussionSelectionSchema.safeParse({
      kind: "compare",
      proposalIds: ["proposal-budget", "proposal-budget"],
    }).success,
    false,
  );

  const response = await requestJson(
    createTestApp(turn),
    "/api/facilitator/group-chat/start",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      confirmedExperts: [expert, alternativeExpert],
      initialExpertComments: [comment],
      discussionSelection: { kind: "deep_dive", proposalId: "unknown" },
    },
  );

  assert.equal(response.status, 400);
});

test("グループチャット継続は開始時の案選択をLLM文脈へ渡す", async () => {
  let structuredRequest: unknown;
  const response = await requestJson(
    createTestApp(userTurn, "test-api-key", (request) => {
      structuredRequest = request;
    }),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert, alternativeExpert],
      expertRepliesSinceUser: 2,
      discussionContext: {
        selection: { kind: "compare", proposalIds: ["a", "b"] },
        proposals: [
          { ...discussionProposal, proposal: { ...comment.proposal, id: "a" } },
          {
            ...alternativeDiscussionProposal,
            proposal: { ...comment.proposal, id: "b" },
          },
        ],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (
      structuredRequest as {
        userInput: { discussionContext: unknown };
      }
    ).userInput.discussionContext,
    {
      selection: { kind: "compare", proposalIds: ["a", "b"] },
      proposals: [
        { ...discussionProposal, proposal: { ...comment.proposal, id: "a" } },
        {
          ...alternativeDiscussionProposal,
          proposal: { ...comment.proposal, id: "b" },
        },
      ],
    },
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/facilitator/group-chat/next は不正な発話者の理由を付けて再生成する", async () => {
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const invalidTurn = {
    ...turn,
    requestedSpeaker: { ...turn.requestedSpeaker, speakerType: "facilitator" },
  };
  const response = await requestJson(
    createTestApp([invalidTurn, turn], "test-api-key", (request) => {
      structuredRequests.push(request as { repairInstruction?: string });
    }),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 1,
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /path=requestedSpeaker.speakerType,code=invalid_requested_speaker/,
  );
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/facilitator/group-chat/next は直前とは別の専門家へ応答をつなぐ", async () => {
  const sameExpertTurn = turn;
  const alternativeExpertTurn = {
    ...turn,
    requestedSpeaker: {
      speakerType: "expert",
      speakerName: alternativeExpert.role_name,
      participantId: alternativeExpert.participantId,
    },
    message: "家計面の主張を踏まえ、教育面から検討します。",
    requestReason: "費用優先への留保を確認するためです。",
    question: "費用を優先する考えに留保があれば、条件とともに示してください。",
  };
  const recentExpertMessage = {
    id: "expert-reply-1",
    speakerType: "expert" as const,
    speakerName: expert.role_name,
    participantId: expert.participantId,
    content: "予算を優先すべきです。",
    createdAt: "2026-07-18T00:01:00.000Z",
  };

  const response = await requestJson(
    createTestApp([sameExpertTurn, alternativeExpertTurn]),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [recentExpertMessage],
      confirmedExperts: [expert, alternativeExpert],
      expertRepliesSinceUser: 1,
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal, alternativeDiscussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (response.body as typeof alternativeExpertTurn).requestedSpeaker
      .participantId,
    alternativeExpert.participantId,
  );
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body as typeof userTurn).userOptions,
    userTurn.userOptions,
  );
  assert.equal(FacilitatorTurnSchema.safeParse(userTurn).success, true);
});

test("POST /api/facilitator/group-chat/next はMarkdownの選択肢を理由に再生成する", async () => {
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const invalidUserTurn = {
    ...userTurn,
    userOptions: ["**費用を優先して検討したい**", "そのまま意見交換を続けて"],
  };
  const response = await requestJson(
    createTestApp([invalidUserTurn, userTurn], "test-api-key", (request) => {
      structuredRequests.push(request as { repairInstruction?: string });
    }),
    "/api/facilitator/group-chat/next",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [],
      confirmedExperts: [expert],
      expertRepliesSinceUser: 2,
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(structuredRequests.length, 2);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /failure_classification=post_validation/,
  );
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 502);
  assert.equal(FacilitatorTurnSchema.safeParse(invalidUserTurn).success, false);
});

test("POST /api/facilitator/group-chat/next は重複するユーザー選択肢を再試行後に拒否する", async () => {
  const invalidUserTurn = {
    ...userTurn,
    userOptions: ["そのまま意見交換を続けて", "そのまま意見交換を続けて"],
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
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
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
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
      discussionSelection: { kind: "defer" },
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/expert/group-chat は専門家として発言を返し未知の入力を拒否する", async () => {
  let structuredRequest: unknown;
  const reply = {
    id: "reply-1",
    speakerType: "expert",
    speakerName: expert.role_name,
    participantId: expert.participantId,
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
    discussionContext: {
      selection: { kind: "defer" },
      proposals: [discussionProposal],
    },
  };
  const response = await requestJson(
    createTestApp(reply, "test-api-key", (input) => {
      structuredRequest = input;
    }),
    "/api/expert/group-chat",
    request,
  );
  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { speakerType: string }).speakerType,
    "expert",
  );
  assert.deepEqual(
    (
      structuredRequest as {
        userInput: { discussionContext: unknown };
      }
    ).userInput.discussionContext,
    { selection: { kind: "defer" }, proposals: [discussionProposal] },
  );
  const invalidResponse = await requestJson(
    createTestApp(reply),
    "/api/expert/group-chat",
    { ...request, unexpected: true },
  );
  assert.equal(invalidResponse.status, 400);
});

test("POST /api/expert/group-chat はMarkdownを含む専門家発言を再生成する", async () => {
  const userContent = `**${"ユーザー入力".repeat(40)}**\n補足`;
  const invalidReply = {
    id: "reply-1",
    speakerType: "expert",
    speakerName: expert.role_name,
    participantId: expert.participantId,
    content: "**予算を確認します。**",
    createdAt: "2026-07-18T00:00:00.000Z",
  };
  const validReply = { ...invalidReply, content: "予算を確認します。" };
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const response = await requestJson(
    createTestApp([invalidReply, validReply], "test-api-key", (request) => {
      structuredRequests.push(request as { repairInstruction?: string });
    }),
    "/api/expert/group-chat",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages: [
        {
          id: "user-1",
          speakerType: "user",
          speakerName: "あなた",
          participantId: "user",
          content: userContent,
          createdAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      expert,
      facilitatorQuestion: "予算の考え方を教えてください。",
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(structuredRequests.length, 2);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /failure_classification=post_validation/,
  );
});

test("POST /api/expert/group-chat はrecentMessagesにない過去IDを返されても新しいIDを付与する", async () => {
  const oldMessageId = "expert-old-message";
  const recentMessages = Array.from({ length: 8 }, (_, index) => ({
    id: `message-${index + 1}`,
    speakerType: "facilitator" as const,
    speakerName: "ファシリテーター",
    participantId: "facilitator",
    content: `費用面を確認します。${index + 1}`,
    createdAt: "2026-07-18T00:00:00.000Z",
  }));
  const replyWithOldId = {
    id: oldMessageId,
    speakerType: "expert",
    speakerName: expert.role_name,
    participantId: expert.participantId,
    content: "予算を確認します。",
    createdAt: "2026-07-18T00:01:00.000Z",
  };

  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const response = await requestJson(
    createTestApp(replyWithOldId, "test-api-key", (request) => {
      structuredRequests.push(request as { repairInstruction?: string });
    }),
    "/api/expert/group-chat",
    {
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "費用を検討中です。",
      recentMessages,
      expert,
      facilitatorQuestion: "予算の考え方を教えてください。",
      discussionContext: {
        selection: { kind: "defer" },
        proposals: [discussionProposal],
      },
    },
  );

  assert.equal(response.status, 200);
  const responseBody = response.body as { id: string; content: string };
  const existingMessageIds = new Set([
    oldMessageId,
    ...recentMessages.map((message) => message.id),
  ]);
  assert.equal(existingMessageIds.has(responseBody.id), false);
  assert.match(responseBody.id, /^expert-[0-9a-f-]{36}$/);
  assert.equal(responseBody.content, replyWithOldId.content);
  assert.equal(structuredRequests.length, 1);
});
