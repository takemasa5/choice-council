import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialSessionState,
  proceedToExpertSelection,
  restoreStoredSessionState,
  returnToPhase,
  settleFinalMemo,
  startSession,
} from "../../src/client/session-lifecycle";
import { memo } from "../../test-support/server";

const facilitatorResponse = {
  current_phase: "premise" as const,
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
  });

  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.memo_updates.status, "in_progress");
  assert.equal(restored.responseHistory.final_memo, undefined);
});
