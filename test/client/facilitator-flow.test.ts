import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsultationStartRequest,
  buildFacilitatorResponseRequest,
  createFailedFacilitatorRequest,
} from "../../src/client/facilitator-flow";
import type {
  FacilitatorResponseRequest,
  SessionMemo,
} from "../../src/shared/schemas/session";

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
