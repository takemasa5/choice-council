import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  groupChatReducer,
  initialGroupChatState,
} from "../../src/client/group-chat-state";
import { GroupChatPhase } from "../../src/client/phases/GroupChatPhase";
import { normalizeStoredSession } from "../../src/client/session-lifecycle";
import type {
  FacilitatorTurn,
  GroupChatMessage,
} from "../../src/shared/schemas/session";

const turn: FacilitatorTurn = {
  message: "次はユーザーに確認します。",
  requestedSpeaker: {
    speakerType: "user",
    participantId: "user",
    speakerName: "あなた",
  },
  requestReason: "判断材料を確認するためです。",
  question: "どちらを優先しますか？",
  userOptions: ["案A", "その他"],
  memoUpdate: null,
  contextSummaryUpdate: null,
};

const message: GroupChatMessage = {
  id: "facilitator-1",
  speakerType: "facilitator",
  speakerName: "ファシリテーター",
  participantId: "facilitator",
  content: turn.message,
  createdAt: "2026-07-18T00:00:00.000Z",
};

test("グループチャットのターン更新は会話文脈と連続専門家数を同時に保持する", () => {
  const state = groupChatReducer(initialGroupChatState, {
    type: "set_turn",
    messages: [message],
    turn,
    contextSummary: "直近の論点",
    expertRepliesSinceUser: 1,
  });

  assert.deepEqual(state.messages, [message]);
  assert.equal(state.turn, turn);
  assert.equal(state.contextSummary, "直近の論点");
  assert.equal(state.expertRepliesSinceUser, 1);
});

test("グループチャットのリセットはすべての会話状態を初期化する", () => {
  const state = groupChatReducer(
    {
      messages: [message],
      turn,
      contextSummary: "直近の論点",
      otherAnswer: "自由入力",
      expertRepliesSinceUser: 2,
    },
    { type: "reset" },
  );

  assert.deepEqual(state, initialGroupChatState);
});

test("グループチャットの復元は累積要約と連続専門家回答数を保持する", () => {
  const state = groupChatReducer(initialGroupChatState, {
    type: "restore",
    state: {
      messages: [message],
      turn,
      contextSummary: "保存済みの論点",
      expertRepliesSinceUser: 2,
    },
  });

  assert.deepEqual(state.messages, [message]);
  assert.equal(state.contextSummary, "保存済みの論点");
  assert.equal(state.expertRepliesSinceUser, 2);
});

test("旧保存形式の会話はApp復元と同じ経路で平文化して表示する", () => {
  const legacyMessage = `**${"発言".repeat(101)}**\n補足`;
  const legacyTurn = {
    message: `**${"進行".repeat(101)}**`,
    requestedSpeaker: {
      speakerType: "expert" as const,
      speakerName: "家計アドバイザー",
      participantId: "expert-1",
    },
    requestReason: "`理由`\n補足",
    question: "[質問](relative)",
    userOptions: null,
    memoUpdate: null,
    contextSummaryUpdate: "検討中です。",
  };
  const normalizedSession = normalizeStoredSession({
    request: { consultation: "相談内容" },
    response: null,
    groupChatMessages: [
      {
        id: "expert-1",
        speakerType: "expert",
        speakerName: "家計アドバイザー",
        participantId: "expert-1",
        content: legacyMessage,
        createdAt: "2026-08-11T00:00:00.000Z",
      },
    ],
    groupChatTurn: legacyTurn,
  } as never);
  const restoredState = groupChatReducer(initialGroupChatState, {
    type: "restore",
    state: {
      messages: normalizedSession.groupChatMessages ?? [],
      turn: normalizedSession.groupChatTurn ?? null,
      contextSummary: normalizedSession.groupChatContextSummary ?? "",
      expertRepliesSinceUser:
        normalizedSession.groupChatExpertRepliesSinceUser ?? 0,
      isNextTurnRetryPending:
        normalizedSession.groupChatNextTurnRetryPending ?? false,
    },
  });
  const markup = renderToStaticMarkup(
    createElement(GroupChatPhase, {
      turn: restoredState.turn,
      messages: restoredState.messages,
      otherAnswer: restoredState.otherAnswer,
      isLoading: false,
      errorMessage: "",
      onOtherAnswerChange: () => undefined,
      onUserAnswer: () => undefined,
      onRetryExpertReply: () => undefined,
      finishErrorMessage: "",
      onFinish: () => undefined,
    }),
  );

  assert.equal(restoredState.turn?.message.length, 200);
  assert.equal(restoredState.turn?.requestReason, "理由 補足");
  assert.equal(restoredState.turn?.question, "質問");
  assert.match(markup, /発言/);
  assert.match(markup, /質問/);
  assert.doesNotMatch(markup, /\*\*|\[質問\]\(relative\)|補足/);
});

test("次の進行の再試行待ちでも成功済み専門家回答を保持する", () => {
  const expertMessage: GroupChatMessage = {
    id: "expert-1",
    speakerType: "expert",
    speakerName: "家計アドバイザー",
    participantId: "expert-1",
    content: "予算を優先しましょう。",
    createdAt: "2026-07-18T00:01:00.000Z",
  };
  const pendingState = groupChatReducer(
    { ...initialGroupChatState, turn, messages: [message] },
    {
      type: "set_pending_next_turn",
      messages: [message, expertMessage],
      contextSummary: "予算を優先する論点",
      expertRepliesSinceUser: 1,
    },
  );

  assert.deepEqual(pendingState.messages, [message, expertMessage]);
  assert.equal(pendingState.contextSummary, "予算を優先する論点");
  assert.equal(pendingState.expertRepliesSinceUser, 1);
  assert.equal(pendingState.isNextTurnRetryPending, true);

  const nextState = groupChatReducer(pendingState, {
    type: "set_turn",
    messages: [message, expertMessage],
    turn,
    contextSummary: "次の論点",
    expertRepliesSinceUser: 1,
  });

  assert.equal(nextState.isNextTurnRetryPending, false);
});
