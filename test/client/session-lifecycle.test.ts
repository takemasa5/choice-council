import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialSessionState,
  createStoredSession,
  getRestoredProposalState,
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
  });

  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.memo_updates.status, "in_progress");
  assert.equal(restored.responseHistory.final_memo, undefined);
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
