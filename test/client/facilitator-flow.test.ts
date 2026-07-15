import assert from "node:assert/strict";
import test from "node:test";
import {
  addExpertDraft,
  buildConsultationStartRequest,
  buildFacilitatorResponseRequest,
  canProceedToExpertSelection,
  confirmExpertDrafts,
  createFailedFacilitatorRequest,
  getFacilitatorResponsePhase,
  getInitialExpertRequests,
  getSessionConsultation,
  replaceExpertDraft,
} from "../../src/client/facilitator-flow";
import { maximumExpertRequestCount } from "../../src/shared/schemas/session";
import type {
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorResponseRequest,
  SessionMemo,
} from "../../src/shared/schemas/session";

const expert: ExpertRequest = {
  role_name: "教育相談員",
  viewpoint: "本人の負担",
  request: "選択肢を整理する",
};

const memo: SessionMemo = {
  theme: "中学受験の判断",
  status: "in_progress",
  facts: ["小5の子どもがいる"],
  values: ["本人の負担を抑えたい"],
  concerns: ["親子関係への影響"],
  options: ["受験する", "受験しない"],
  decision_axes: ["本人の納得感"],
  expert_summaries: [],
  conflicts: [],
  open_questions: ["本人の希望"],
  next_actions: ["希望を確認する"],
};

const userQuestion: FacilitatorResponseRequest["userQuestion"] = {
  question: "本人の希望はどれに近いですか？",
  options: ["受験したい", "まだ迷っている", "その他"],
  required: true,
};

test("相談開始リクエストは空の任意項目を送らない", () => {
  const request = buildConsultationStartRequest({
    consultation: "中学受験について相談したい",
    facts: "  小5です  ",
    values: "",
    concerns: "   ",
    expectedOutcome: "判断軸を整理したい",
  });

  assert.deepEqual(request, {
    consultation: "中学受験について相談したい",
    facts: "小5です",
    expectedOutcome: "判断軸を整理したい",
  });
});

test("必須質問への回答リクエストは直前の質問、回答、メモを含める", () => {
  const request = buildFacilitatorResponseRequest({
    consultation: "中学受験について相談したい",
    currentPhase: "premise",
    userQuestion,
    userQuestionAnswer: "まだ迷っている",
    memo,
  });

  assert.deepEqual(request, {
    consultation: "中学受験について相談したい",
    currentPhase: "premise",
    userQuestion,
    userQuestionAnswer: "まだ迷っている",
    memo,
  });
});

test("必須質問への回答がない場合は回答リクエストを作らない", () => {
  const request = buildFacilitatorResponseRequest({
    consultation: "中学受験について相談したい",
    currentPhase: "premise",
    userQuestion,
    userQuestionAnswer: undefined,
    memo,
  });

  assert.equal(request, null);
});

test("失敗リクエストは同一内容でリトライできる形で保持する", () => {
  const request: FacilitatorResponseRequest = {
    consultation: "中学受験について相談したい",
    currentPhase: "premise",
    userQuestion,
    userQuestionAnswer: "まだ迷っている",
    memo,
  };

  const failedRequest = createFailedFacilitatorRequest({
    endpoint: "respond",
    request,
  });

  assert.deepEqual(failedRequest, {
    endpoint: "respond",
    request,
  });
});

test("開始済みセッションでは未送信の編集より確定済み相談内容を使う", () => {
  assert.equal(
    getSessionConsultation(
      "中学受験について相談したい",
      "まだ送信していない別の相談内容",
    ),
    "中学受験について相談したい",
  );
});

test("専門家候補を要求する応答では専門家選定フェーズへ進む", () => {
  assert.equal(
    getFacilitatorResponsePhase({ next_action: "request_experts" }),
    "expert_selection",
  );
  assert.equal(
    getFacilitatorResponsePhase({ next_action: "wait_user" }),
    "premise",
  );
});

test("専門家候補を要求する前提整理応答は専門家選定へ進める", () => {
  assert.equal(
    canProceedToExpertSelection({
      next_action: "request_experts",
      user_question: null,
    }),
    true,
  );
  assert.equal(
    canProceedToExpertSelection({
      next_action: "wait_user",
      user_question: null,
    }),
    false,
  );
});

test("専門家候補は上限まで追加でき、上限では追加操作が状態を変えない", () => {
  const drafts = Array.from({ length: maximumExpertRequestCount - 1 }, () => ({
    ...expert,
  }));

  const atLimit = addExpertDraft(drafts);

  assert.equal(atLimit.length, maximumExpertRequestCount);
  assert.strictEqual(addExpertDraft(atLimit), atLimit);
});

test("専門家候補の入れ替えは3項目をすべて空にする", () => {
  assert.deepEqual(replaceExpertDraft([expert], 0), [
    { role_name: "", viewpoint: "", request: "" },
  ]);
});

test("空行を除外して編集済みの専門家候補を確定する", () => {
  assert.deepEqual(
    confirmExpertDrafts([
      { ...expert, role_name: "  教育相談員  " },
      { role_name: "", viewpoint: "", request: "" },
    ]),
    { experts: [expert], errorMessage: "" },
  );
});

test("一部だけ入力された専門家候補は確定できない", () => {
  assert.deepEqual(
    confirmExpertDrafts([
      { role_name: "教育相談員", viewpoint: "", request: "" },
    ]),
    {
      experts: [],
      errorMessage:
        "追加した専門家ロールの役割名、観点、依頼をすべて入力してください。",
    },
  );
});

test("旧形式の専門家選定セッションでは応答候補を初期候補として復元する", () => {
  const response = { expert_requests: [expert] } as FacilitatorResponse;

  assert.deepEqual(
    getInitialExpertRequests(undefined, "expert_selection", response),
    [expert],
  );
});
