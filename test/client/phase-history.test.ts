import assert from "node:assert/strict";
import test from "node:test";
import {
  clearResponseHistory,
  createResponseForPhase,
  createResponseHistoryForNewConsultation,
  getExpertCommentsForReturn,
  getReturnablePhases,
  keepResponsesThroughPhase,
  type ResponseHistory,
} from "../../src/client/phase-history";
import type {
  ExpertRequest,
  ExpertComment,
  FacilitatorResponse,
} from "../../src/shared/schemas/session";

const response = (phase: FacilitatorResponse["current_phase"]) =>
  ({ current_phase: phase }) as FacilitatorResponse;

test("方向性整理からは専門家選定へ戻り、検討を直接の戻り先にしない", () => {
  const history: ResponseHistory = {
    premise: response("premise"),
    expert_selection: response("expert_selection"),
    deliberation: response("deliberation"),
    direction: response("direction"),
  };

  assert.deepEqual(getReturnablePhases("direction", history), [
    "consultation_input",
    "premise",
    "expert_selection",
  ]);
});

test("専門家選定へ戻るとその入力状態を残して後続履歴を破棄する", () => {
  const expertSelection = response("expert_selection");
  const history: ResponseHistory = {
    premise: response("premise"),
    expert_selection: expertSelection,
    direction: response("direction"),
  };

  assert.deepEqual(keepResponsesThroughPhase(history, "expert_selection"), {
    premise: history.premise,
    expert_selection: expertSelection,
  });
});

test("新しい相談の開始時は旧フェーズ履歴を保存せず新しい応答だけを保持する", () => {
  const oldHistory: ResponseHistory = {
    premise: response("premise"),
    expert_selection: response("expert_selection"),
    direction: response("direction"),
    final_memo: response("final_memo"),
  };
  const newResponse = response("premise");
  const clearedHistory = clearResponseHistory();

  assert.deepEqual(clearedHistory, {});
  assert.deepEqual(
    createResponseHistoryForNewConsultation(
      newResponse,
      newResponse,
      "premise",
    ),
    { premise: newResponse },
  );
  assert.notDeepEqual(clearedHistory, oldHistory);
});

test("確定済みの専門家ロールを専門家選定の履歴へ保存する", () => {
  const confirmedExperts: ExpertRequest[] = [
    {
      role_name: "教育コンサルタント",
      viewpoint: "学習負荷",
      request: "家庭への負担を確認する",
    },
  ];

  assert.deepEqual(
    createResponseForPhase(
      response("premise"),
      "expert_selection",
      confirmedExperts,
    ).expert_requests,
    confirmedExperts,
  );
});

test("専門家コメント生成後は確定済みロールを保持して検討フェーズへ進む", () => {
  const confirmedExperts: ExpertRequest[] = [
    {
      role_name: "教育コンサルタント",
      viewpoint: "学習負荷",
      request: "家庭への負担を確認する",
    },
  ];

  const deliberation = createResponseForPhase(
    response("expert_selection"),
    "deliberation",
    confirmedExperts,
  );

  assert.equal(deliberation.current_phase, "deliberation");
  assert.deepEqual(deliberation.expert_requests, confirmedExperts);
});

test("方向性整理へ戻る場合は専門家コメントを残す", () => {
  const expertComments = [
    { role_name: "教育コンサルタント" },
  ] as ExpertComment[];

  assert.equal(
    getExpertCommentsForReturn("direction", expertComments),
    expertComments,
  );
  assert.deepEqual(
    getExpertCommentsForReturn("expert_selection", expertComments),
    [],
  );
});
