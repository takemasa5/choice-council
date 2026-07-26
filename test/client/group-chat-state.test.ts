import test from "node:test";
import assert from "node:assert/strict";
import {
  groupChatReducer,
  initialGroupChatState,
} from "../../src/client/group-chat-state";
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
