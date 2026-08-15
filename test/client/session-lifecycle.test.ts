import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupChatPhase } from "../../src/client/phases/GroupChatPhase";
import {
  createSessionRequest,
  createInitialSessionState,
  createStoredSession,
  getRestoredProposalState,
  normalizeStoredSession,
  proceedToExpertSelection,
  restoreStoredSessionState,
  returnToPhase,
  settleFinalMemo,
  startSession,
} from "../../src/client/session-lifecycle";
import {
  ConsultationRequestSchema,
  ExpertCommentSchema,
  FacilitatorResponseSchema,
  FacilitatorTurnSchema,
  GroupChatMessageSchema,
  GroupChatNextRequestSchema,
  SessionMemoSchema,
} from "../../src/shared/schemas/session";
import { memo } from "../../test-support/server";

const facilitatorResponse = {
  current_phase: "premise" as const,
  current_phase_label: "前提整理",
  phase_goal: "前提を整理する",
  facilitator_message: "前提を確認します。",
  next_action: "wait_user" as const,
  memo_updates: memo,
  expert_requests: [
    {
      role_name: "専門家",
      viewpoint: "観点",
      request: "整理してください",
    },
  ],
  user_question: null,
};

const expertComment = {
  role_name: "専門家",
  viewpoint: "観点",
  summary: "要約",
  proposal: {
    id: "proposal-1",
    name: "案",
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
};

const groupChatTurn = {
  message: "進行します。",
  requestedSpeaker: {
    speakerType: "expert" as const,
    speakerName: "専門家",
    participantId: "expert-1",
  },
  requestReason: "意見を確認します。",
  question: "どの条件を優先しますか。",
  userOptions: null,
  memoUpdate: null,
  contextSummaryUpdate: null,
};

test("相談開始時に開始済み相談、現在フェーズ、応答履歴をまとめて確定する", () => {
  const state = startSession(
    { consultation: "相談内容" },
    facilitatorResponse as never,
    "premise",
  );

  assert.equal(state.startedConsultation, "相談内容");
  assert.equal(state.currentPhase, "premise");
  assert.equal(state.response?.current_phase, "premise");
  assert.equal(state.responseHistory.premise, facilitatorResponse);
});

test("専門家選定へ進むと、それ以前の履歴を維持して選定応答を追加する", () => {
  const started = startSession(
    { consultation: "相談内容" },
    facilitatorResponse as never,
    "premise",
  );
  const state = proceedToExpertSelection(started);

  assert.equal(state.currentPhase, "expert_selection");
  assert.equal(state.response?.current_phase, "expert_selection");
  assert.equal(state.responseHistory.premise, facilitatorResponse);
  assert.equal(
    state.responseHistory.expert_selection?.current_phase,
    "expert_selection",
  );
});

test("終了メモから戻ると後続履歴を破棄して対象フェーズの応答を復元する", () => {
  const base = {
    ...createInitialSessionState(),
    currentPhase: "group_chat" as const,
    response: {
      ...facilitatorResponse,
      current_phase: "group_chat" as const,
    } as never,
    responseHistory: {
      premise: facilitatorResponse as never,
      expert_selection: {
        ...facilitatorResponse,
        current_phase: "expert_selection" as const,
      } as never,
      group_chat: {
        ...facilitatorResponse,
        current_phase: "group_chat" as const,
      } as never,
    },
  };
  const finalized = settleFinalMemo(base, {
    ...memo,
    status: "tentative_conclusion",
  });
  const returned = returnToPhase(finalized, "expert_selection");

  assert.equal(returned.currentPhase, "expert_selection");
  assert.equal(returned.response?.current_phase, "expert_selection");
  assert.equal(returned.responseHistory.group_chat, undefined);
  assert.equal(returned.responseHistory.final_memo, undefined);
});

test("Markdown のない終了メモを保存データから復元すると意見交換へ戻す", () => {
  const restored = restoreStoredSessionState({
    request: { consultation: "相談内容" },
    response: {
      ...facilitatorResponse,
      current_phase: "final_memo" as const,
      memo_updates: { ...memo, status: "pending_research" as const },
    } as never,
    responseHistory: {
      group_chat: {
        ...facilitatorResponse,
        current_phase: "group_chat" as const,
      } as never,
      final_memo: {
        ...facilitatorResponse,
        current_phase: "final_memo" as const,
        memo_updates: { ...memo, status: "pending_research" as const },
      } as never,
    },
    currentPhase: "final_memo",
    confirmedExperts: [facilitatorResponse.expert_requests[0]],
    expertComments: [expertComment],
    discussionSelection: { kind: "deep_dive", proposalId: "proposal-1" },
    selectedProposalIds: ["proposal-1"],
    groupChatTurn,
  });

  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.memo_updates.status, "in_progress");
  assert.equal(restored.responseHistory.final_memo, undefined);
});

test("旧形式のメモを正規化して復元後もAPI入力として継続できる", () => {
  const oldMemo = {
    ...memo,
    theme: `  # ${"相談テーマ".repeat(30)}\n`,
    facts: ["- 最初の事実\n補足", "", "1. 2番目の事実", "```", "4番目の事実"],
    values: ["* 価値観", "あ".repeat(81), "3. 条件", "4. 除外対象"],
  };
  const restored = restoreStoredSessionState({
    request: { consultation: "相談内容", memo: oldMemo } as never,
    response: {
      ...facilitatorResponse,
      current_phase: "premise" as const,
      memo_updates: oldMemo,
    } as never,
    responseHistory: {
      premise: {
        ...facilitatorResponse,
        current_phase: "premise" as const,
        memo_updates: oldMemo,
      } as never,
    },
    currentPhase: "premise",
  });

  const restoredMemo = restored.response?.memo_updates;
  assert.ok(restoredMemo);
  assert.equal(restoredMemo.theme.length, 120);
  assert.doesNotMatch(restoredMemo.theme, /^\s*#/);
  assert.deepEqual(restoredMemo.facts, [
    "最初の事実 補足",
    "2番目の事実",
    "4番目の事実",
  ]);
  assert.deepEqual(restoredMemo.values, ["価値観", "あ".repeat(80), "条件"]);
  assert.ok(SessionMemoSchema.safeParse(restoredMemo).success);

  const continuationRequest = createSessionRequest({
    consultation: "相談内容",
    facts: "",
    values: "",
    concerns: "",
    expectedOutcome: "",
    state: restored,
  });
  assert.ok(SessionMemoSchema.safeParse(continuationRequest.memo).success);
  assert.deepEqual(
    restored.responseHistory.premise?.memo_updates,
    restoredMemo,
  );
});

test("旧メモのinline Markdownを平文化して有効なセッション状態を復元する", () => {
  const oldMemo = {
    ...memo,
    theme:
      "**相談テーマ** と `条件`を [確認資料](https://example.com) で整理する",
    facts: ["**重要な事実**", "`確認コード`", "[参考資料](/reference)"],
    values: ["![図の説明](https://example.com/image.png)"],
  };
  const restored = restoreStoredSessionState({
    request: { consultation: "相談内容", memo: oldMemo } as never,
    response: {
      ...facilitatorResponse,
      current_phase: "premise" as const,
      memo_updates: oldMemo,
    } as never,
    responseHistory: {
      premise: {
        ...facilitatorResponse,
        current_phase: "premise" as const,
        memo_updates: oldMemo,
      } as never,
    },
    currentPhase: "premise",
  });

  const restoredMemo = restored.response?.memo_updates;
  assert.ok(restoredMemo);
  assert.equal(restoredMemo.theme, "相談テーマ と 条件を 確認資料 で整理する");
  assert.deepEqual(restoredMemo.facts, [
    "重要な事実",
    "確認コード",
    "参考資料",
  ]);
  assert.deepEqual(restoredMemo.values, ["図の説明"]);
  assert.ok(SessionMemoSchema.safeParse(restoredMemo).success);

  const continuationRequest = createSessionRequest({
    consultation: "相談内容",
    facts: "",
    values: "",
    concerns: "",
    expectedOutcome: "",
    state: restored,
  });
  assert.ok(ConsultationRequestSchema.safeParse(continuationRequest).success);
});

test("旧形式の専門家コメントを正規化して意見交換フェーズを復元する", () => {
  const oldComment = {
    ...expertComment,
    summary: `**${"要".repeat(180)}**\n~~${"約".repeat(180)}~~`,
    proposal: {
      ...expertComment.proposal,
      name: `**${"案".repeat(121)}**`,
      content: "`内容`\n補足",
      benefits: ["- **利点**\n補足"],
      sacrifices: ["~~犠牲~~"],
      conditions: ["[条件](relative)"],
    },
    key_point: "*要点*",
    concern: "_懸念_",
    question_to_user: "`質問`",
  };
  const confirmedExpert = {
    ...facilitatorResponse.expert_requests[0],
    participantId: "expert-1",
  };
  const stored = {
    request: { consultation: "相談内容" },
    response: {
      ...facilitatorResponse,
      current_phase: "group_chat" as const,
    } as never,
    responseHistory: {
      group_chat: {
        ...facilitatorResponse,
        current_phase: "group_chat" as const,
      } as never,
    },
    currentPhase: "group_chat" as const,
    confirmedExperts: [confirmedExpert],
    expertComments: [oldComment],
    discussionSelection: {
      kind: "deep_dive" as const,
      proposalId: "proposal-1",
    },
    selectedProposalIds: ["proposal-1"],
    groupChatTurn,
  };

  const proposalState = getRestoredProposalState(stored as never);
  const restored = restoreStoredSessionState(stored as never);
  const [restoredComment] = proposalState.expertComments;

  assert.equal(proposalState.isValid, true);
  assert.ok(restoredComment);
  assert.equal(restoredComment.summary.length, 300);
  assert.doesNotMatch(restoredComment.summary, /[\r\n*~`]/);
  assert.equal(restoredComment.proposal.name.length, 120);
  assert.deepEqual(restoredComment.proposal.benefits, ["利点 補足"]);
  assert.deepEqual(restoredComment.proposal.sacrifices, ["犠牲"]);
  assert.deepEqual(restoredComment.proposal.conditions, ["条件"]);
  assert.ok(ExpertCommentSchema.safeParse(restoredComment).success);
  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.current_phase, "group_chat");
  assert.ok(
    GroupChatNextRequestSchema.safeParse({
      consultation: "相談内容",
      currentPhase: "group_chat",
      memo,
      contextSummary: "検討中です。",
      recentMessages: [],
      confirmedExperts: [confirmedExpert],
      expertRepliesSinceUser: 0,
      discussionContext: {
        selection: proposalState.discussionSelection,
        proposals: [
          {
            participantId: confirmedExpert.participantId,
            roleName: confirmedExpert.role_name,
            proposal: restoredComment.proposal,
          },
        ],
      },
    }).success,
  );
});

test("旧形式の通常画面出力を平文化して意見交換状態を復元する", () => {
  const legacyResponse = {
    ...facilitatorResponse,
    current_phase: "group_chat" as const,
    current_phase_label: `**${"進".repeat(151)}**\n`,
    phase_goal: `\`${"目".repeat(151)}\``,
    facilitator_message: `- **${"案内".repeat(80)}**`,
  };
  const legacyMessage = {
    id: "message-1",
    speakerType: "expert" as const,
    speakerName: "専門家",
    participantId: "expert-1",
    content: `**${"発言".repeat(101)}**\n補足`,
    createdAt: "2026-08-11T00:00:00.000Z",
  };
  const legacyTurn = {
    message: `**${"進行".repeat(101)}**`,
    requestedSpeaker: {
      speakerType: "expert" as const,
      speakerName: "専門家",
      participantId: "expert-1",
    },
    requestReason: "`理由`\n補足",
    question: "[質問](relative)",
    userOptions: null,
    memoUpdate: null,
    contextSummaryUpdate: "検討中です。",
  };
  const confirmedExpert = {
    ...facilitatorResponse.expert_requests[0],
    participantId: "expert-1",
  };
  const stored = {
    request: { consultation: "相談内容" },
    response: legacyResponse,
    responseHistory: { group_chat: legacyResponse },
    currentPhase: "group_chat" as const,
    confirmedExperts: [confirmedExpert],
    expertComments: [expertComment],
    groupChatMessages: [legacyMessage],
    groupChatTurn: legacyTurn,
    discussionSelection: {
      kind: "deep_dive" as const,
      proposalId: "proposal-1",
    },
    selectedProposalIds: ["proposal-1"],
  };

  const normalized = normalizeStoredSession(stored as never);
  const restored = restoreStoredSessionState(stored as never);
  const [message] = normalized.groupChatMessages ?? [];

  assert.ok(FacilitatorResponseSchema.safeParse(normalized.response).success);
  assert.ok(
    FacilitatorResponseSchema.safeParse(normalized.responseHistory?.group_chat)
      .success,
  );
  assert.ok(GroupChatMessageSchema.safeParse(message).success);
  assert.ok(FacilitatorTurnSchema.safeParse(normalized.groupChatTurn).success);
  assert.ok(normalized.response);
  assert.doesNotMatch(
    [
      normalized.response.current_phase_label,
      normalized.response.phase_goal,
      normalized.response.facilitator_message,
      message?.content,
      normalized.groupChatTurn?.message,
      normalized.groupChatTurn?.requestReason,
      normalized.groupChatTurn?.question,
    ].join(" "),
    /[\r\n*`]|\[[^\]]+\]\(/,
  );
  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.current_phase, "group_chat");
});

test("保存済みのユーザー発言は復元時に内容を加工しない", () => {
  const userContent = `> > **${"ユーザー入力".repeat(40)}**\n補足`;
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatMessages: [
      {
        id: "user-1",
        speakerType: "user",
        speakerName: "あなた",
        participantId: "user",
        content: userContent,
        createdAt: "2026-08-11T00:00:00.000Z",
      },
    ],
  } as never);

  assert.equal(normalized.groupChatMessages?.[0]?.content, userContent);
  assert.ok(
    GroupChatMessageSchema.safeParse(normalized.groupChatMessages?.[0]).success,
  );
});

test("旧ASCII引用を含む通常のグループチャットターンを平文化する", () => {
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: {
      message: "> > 本文",
      requestedSpeaker: {
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
      },
      requestReason: "通常の理由です。",
      question: "通常の質問です。",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  } as never);

  assert.ok(FacilitatorTurnSchema.safeParse(normalized.groupChatTurn).success);
  assert.equal(normalized.groupChatTurn?.message, "本文");
  assert.equal(normalized.groupChatTurn?.requestReason, "通常の理由です。");
  assert.equal(normalized.groupChatTurn?.question, "通常の質問です。");
});

test("旧ASCII引用を含む専門家発言だけを平文化し、全角引用は保持する", () => {
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatMessages: [
      {
        id: "legacy-expert",
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
        content: "> > 本文",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
      {
        id: "current-expert",
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
        content: "＞ ＞ 本文",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
    ],
  } as never);

  assert.deepEqual(
    normalized.groupChatMessages?.map((message) => message.content),
    ["本文", "＞ ＞ 本文"],
  );
});

test("旧ターンのその他は除外し自由入力可能なユーザーターンを復元する", () => {
  const legacyTurn = {
    message: "次はユーザーに確認します。",
    requestedSpeaker: {
      speakerType: "user" as const,
      speakerName: "あなた",
      participantId: "user",
    },
    requestReason: "優先順位を確認するためです。",
    question: "どちらを優先しますか？",
    userOptions: ["費用を優先して検討したい", "その他"],
    memoUpdate: null,
    contextSummaryUpdate: null,
  };
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: legacyTurn,
  } as never);
  const turn = normalized.groupChatTurn;
  const markup = renderToStaticMarkup(
    createElement(GroupChatPhase, {
      turn: turn ?? null,
      messages: [],
      otherAnswer: "",
      isLoading: false,
      errorMessage: "",
      onOtherAnswerChange: () => undefined,
      onUserAnswer: () => undefined,
      onRetryExpertReply: () => undefined,
      finishErrorMessage: "",
      onFinish: () => undefined,
    }),
  );
  const currentTurn = {
    ...legacyTurn,
    userOptions: ["費用を優先して検討したい", "そのまま意見交換を続けて"],
  };
  const current = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: currentTurn,
  } as never);

  assert.ok(FacilitatorTurnSchema.safeParse(turn).success);
  assert.deepEqual(turn?.userOptions, currentTurn.userOptions);
  assert.deepEqual(current.groupChatTurn, currentTurn);
  assert.match(markup, /費用を優先して検討したい/);
  assert.match(markup, /自由入力/);
  assert.doesNotMatch(markup, /その他/);
});

test("入れ子引用と入れ子リストを含む旧グループチャットターンを平文化して表示する", () => {
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: {
      message: "  > > 専門家へ質問します。",
      requestedSpeaker: {
        speakerType: "expert",
        speakerName: "家計アドバイザー",
        participantId: "expert-1",
      },
      requestReason: "- - 費用 > 予算を確認するためです。",
      question: "> > 予算の上限を教えてください。",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  } as never);
  const turn = normalized.groupChatTurn;
  const markup = renderToStaticMarkup(
    createElement(GroupChatPhase, {
      turn: turn ?? null,
      messages: [],
      otherAnswer: "",
      isLoading: false,
      errorMessage: "",
      onOtherAnswerChange: () => undefined,
      onUserAnswer: () => undefined,
      onRetryExpertReply: () => undefined,
      finishErrorMessage: "",
      onFinish: () => undefined,
    }),
  );

  assert.ok(FacilitatorTurnSchema.safeParse(turn).success);
  assert.equal(turn?.message, "専門家へ質問します。");
  assert.equal(turn?.question, "予算の上限を教えてください。");
  assert.equal(turn?.requestReason, "費用 ＞ 予算を確認するためです。");
  assert.match(markup, /予算の上限を教えてください。/);
  assert.doesNotMatch(markup, /&gt; 予算の上限/);
});

test("旧コードフェンスを言語指定と閉じフェンスなしの本文へ平文化する", () => {
  const normalized = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: {
      message: "```ts\n本文\n```",
      requestedSpeaker: {
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
      },
      requestReason: "> ```ts\n理由\n```",
      question: "質問本文\n```",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  } as never);

  assert.ok(FacilitatorTurnSchema.safeParse(normalized.groupChatTurn).success);
  assert.equal(normalized.groupChatTurn?.message, "本文");
  assert.equal(normalized.groupChatTurn?.requestReason, "理由");
  assert.equal(normalized.groupChatTurn?.question, "質問本文");

  const nonFence = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: {
      message: "本文中の ``` 記号は維持します。",
      requestedSpeaker: {
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
      },
      requestReason: "通常の理由です。",
      question: "通常の質問です。",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  } as never);

  assert.equal(
    nonFence.groupChatTurn?.message,
    "本文中の ``` 記号は維持します。",
  );
});

test("空本文の旧コードフェンスを空の通常画面値として安全に除外する", () => {
  const turnWithEmptyFence = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatTurn: {
      message: "> ```\n```",
      requestedSpeaker: {
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
      },
      requestReason: "通常の理由です。",
      question: "通常の質問です。",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  } as never);
  const messagesWithEmptyFence = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatMessages: [
      {
        id: "empty-fence",
        speakerType: "expert",
        speakerName: "専門家",
        participantId: "expert-1",
        content: "```ts\n```",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
    ],
  } as never);

  assert.equal(turnWithEmptyFence.groupChatTurn, undefined);
  assert.deepEqual(messagesWithEmptyFence.groupChatMessages, []);
});

test("復元不能な通常画面応答は相談入力へ安全に戻す", () => {
  const restored = restoreStoredSessionState({
    request: { consultation: "相談内容" },
    response: {
      current_phase: "group_chat",
      facilitator_message: "**不完全な応答**",
    },
    currentPhase: "group_chat",
  } as never);

  assert.equal(restored.currentPhase, "consultation_input");
  assert.equal(restored.response, null);
  assert.deepEqual(restored.responseHistory, {});
});

test("復元できない意見交換ターンは検討フェーズへ戻して再生成する", () => {
  const deliberationResponse = {
    ...facilitatorResponse,
    current_phase: "deliberation" as const,
  };
  const groupChatResponse = {
    ...facilitatorResponse,
    current_phase: "group_chat" as const,
  };
  const stored = {
    request: { consultation: "相談内容" },
    response: groupChatResponse,
    responseHistory: {
      deliberation: deliberationResponse,
      group_chat: groupChatResponse,
    },
    currentPhase: "group_chat" as const,
    confirmedExperts: [facilitatorResponse.expert_requests[0]],
    expertComments: [expertComment],
    discussionSelection: {
      kind: "deep_dive" as const,
      proposalId: "proposal-1",
    },
    selectedProposalIds: ["proposal-1"],
    groupChatTurn: {
      message: "```ts\n```",
      requestedSpeaker: {
        speakerType: "expert" as const,
        speakerName: "専門家",
        participantId: "expert-1",
      },
      requestReason: "理由",
      question: "質問",
      userOptions: null,
      memoUpdate: null,
      contextSummaryUpdate: null,
    },
  };

  const normalized = normalizeStoredSession(stored as never);
  const restored = restoreStoredSessionState(stored as never);

  assert.equal(normalized.groupChatTurn, undefined);
  assert.equal(restored.currentPhase, "deliberation");
  assert.equal(restored.response?.current_phase, "deliberation");
  assert.equal(restored.responseHistory.group_chat, undefined);
  assert.deepEqual(restored.responseHistory.deliberation, deliberationResponse);
});

test("旧形式または参照不整合の案保存値は専門家選定へ安全に戻す", () => {
  const stored = {
    request: { consultation: "相談内容" },
    response: {
      ...facilitatorResponse,
      current_phase: "group_chat" as const,
    } as never,
    responseHistory: {
      premise: facilitatorResponse as never,
      expert_selection: {
        ...facilitatorResponse,
        current_phase: "expert_selection" as const,
      } as never,
      group_chat: {
        ...facilitatorResponse,
        current_phase: "group_chat" as const,
      } as never,
    },
    currentPhase: "group_chat",
    confirmedExperts: [facilitatorResponse.expert_requests[0]],
    expertComments: [
      {
        role_name: "専門家",
        viewpoint: "観点",
        summary: "旧形式のコメント",
      },
    ],
    discussionSelection: { kind: "deep_dive", proposalId: "missing" },
    selectedProposalIds: ["missing"],
  } as never;

  const proposalState = getRestoredProposalState(stored);
  const restored = restoreStoredSessionState(stored);

  assert.equal(proposalState.isValid, false);
  assert.deepEqual(proposalState.expertComments, []);
  assert.equal(proposalState.discussionSelection, null);
  assert.equal(restored.currentPhase, "expert_selection");
  assert.equal(restored.response?.current_phase, "expert_selection");
});

test("復元時は案選択と選択済み案IDの完全一致を要求する", () => {
  const secondComment = {
    ...expertComment,
    role_name: "専門家2",
    proposal: { ...expertComment.proposal, id: "proposal-2" },
  };
  const base = {
    request: { consultation: "相談内容" },
    response: facilitatorResponse as never,
    confirmedExperts: [
      facilitatorResponse.expert_requests[0],
      { role_name: "専門家2", viewpoint: "観点", request: "整理してください" },
    ],
    expertComments: [expertComment, secondComment],
  };

  assert.equal(
    getRestoredProposalState({
      ...base,
      discussionSelection: { kind: "deep_dive", proposalId: "proposal-1" },
      selectedProposalIds: ["proposal-2"],
    }).isValid,
    false,
  );
  assert.equal(
    getRestoredProposalState({
      ...base,
      discussionSelection: {
        kind: "compare",
        proposalIds: ["proposal-1", "proposal-2"],
      },
      selectedProposalIds: ["proposal-2", "proposal-1"],
    }).isValid,
    true,
  );
  assert.equal(
    getRestoredProposalState({
      ...base,
      discussionSelection: {
        kind: "compare",
        proposalIds: ["proposal-1", "proposal-2"],
      },
      selectedProposalIds: ["proposal-1"],
    }).isValid,
    false,
  );
  assert.equal(
    getRestoredProposalState({
      ...base,
      discussionSelection: { kind: "defer" },
      selectedProposalIds: ["proposal-1"],
    }).isValid,
    false,
  );
});

test("選択途中の案は検討フェーズへ復元し、初回コメントを維持する", () => {
  const stored = {
    request: { consultation: "相談内容" },
    response: {
      ...facilitatorResponse,
      current_phase: "deliberation" as const,
    } as never,
    responseHistory: {
      expert_selection: {
        ...facilitatorResponse,
        current_phase: "expert_selection" as const,
      } as never,
      deliberation: {
        ...facilitatorResponse,
        current_phase: "deliberation" as const,
      } as never,
    },
    currentPhase: "deliberation" as const,
    confirmedExperts: [facilitatorResponse.expert_requests[0]],
    expertComments: [expertComment],
    selectedProposalIds: ["proposal-1"],
  };

  const proposalState = getRestoredProposalState(stored);
  const restored = restoreStoredSessionState(stored);

  assert.equal(proposalState.isValid, true);
  assert.equal(proposalState.discussionSelection, null);
  assert.deepEqual(proposalState.selectedProposalIds, ["proposal-1"]);
  assert.deepEqual(proposalState.expertComments, [expertComment]);
  assert.equal(restored.currentPhase, "deliberation");
  assert.equal(restored.response?.current_phase, "deliberation");
});

test("案選択はセッションへ保存できる", () => {
  const state = createInitialSessionState();
  const stored = createStoredSession({
    request: { consultation: "相談内容" },
    state,
    expertComments: [],
    expertDrafts: [],
    confirmedExperts: [],
    groupChatMessages: [],
    groupChatExpertRepliesSinceUser: 0,
    initialExpertRequests: [],
    finalMarkdown: "",
    discussionSelection: {
      kind: "compare",
      proposalIds: ["proposal-a", "proposal-b"],
    },
    selectedProposalIds: ["proposal-a", "proposal-b"],
  });

  assert.deepEqual(stored.discussionSelection, {
    kind: "compare",
    proposalIds: ["proposal-a", "proposal-b"],
  });
  assert.deepEqual(stored.selectedProposalIds, ["proposal-a", "proposal-b"]);
});
