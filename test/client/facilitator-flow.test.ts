import assert from "node:assert/strict";
import test from "node:test";
import {
  addExpertDraft,
  buildConsultationStartRequest,
  buildFacilitatorDeliberationRequest,
  buildFacilitatorResponseRequest,
  canProceedToExpertSelection,
  collectExpertCommentGenerationResults,
  confirmExpertDrafts,
  createFailedFacilitatorRequest,
  discardFailedDeliberationRequest,
  getFacilitatorResponsePhase,
  getInitialExpertRequests,
  getSessionConsultation,
  isAcceptedM3FacilitatorResponse,
  isExpertDraftEditingDisabled,
  replaceExpertDraft,
} from "../../src/client/facilitator-flow";
import { maximumExpertRequestCount } from "../../src/shared/schemas/session";
import type {
  ExpertComment,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorDeliberationRequest,
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

const expertComment: ExpertComment = {
  role_name: expert.role_name,
  viewpoint: expert.viewpoint,
  summary: "本人の負担を優先して判断するべきです。",
  key_point: "本人の希望を確認することです。",
  concern: "準備時間の確保が難しいです。",
  question_to_user: "本人はどの程度希望していますか？",
  confidence: "high",
  needs_research: false,
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

test("全専門家コメントの成功後は整理 API 用の同一順序の入力を作成する", () => {
  assert.deepEqual(
    buildFacilitatorDeliberationRequest({
      consultation: "中学受験について相談したい",
      memo,
      confirmedExperts: [expert],
      expertComments: [expertComment],
    }),
    {
      consultation: "中学受験について相談したい",
      currentPhase: "deliberation",
      memo,
      confirmedExperts: [expert],
      expertComments: [expertComment],
    },
  );
});

test("整理に必要なメモまたは全コメントがなければ整理リクエストを作成しない", () => {
  assert.equal(
    buildFacilitatorDeliberationRequest({
      consultation: "中学受験について相談したい",
      memo: null,
      confirmedExperts: [expert],
      expertComments: [expertComment],
    }),
    null,
  );
  assert.equal(
    buildFacilitatorDeliberationRequest({
      consultation: "中学受験について相談したい",
      memo,
      confirmedExperts: [expert],
      expertComments: [],
    }),
    null,
  );
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

test("ファシリテーター整理の失敗リクエストは同一内容で保持する", () => {
  const request: FacilitatorDeliberationRequest = {
    consultation: "中学受験について相談したい",
    currentPhase: "deliberation",
    memo,
    confirmedExperts: [expert],
    expertComments: [expertComment],
  };

  assert.deepEqual(
    createFailedFacilitatorRequest({ endpoint: "deliberation", request }),
    { endpoint: "deliberation", request },
  );
});

test("専門家候補を変更した場合は古い整理リクエストを破棄する", () => {
  const failedRequest = createFailedFacilitatorRequest({
    endpoint: "deliberation",
    request: {
      consultation: "中学受験について相談したい",
      currentPhase: "deliberation",
      memo,
      confirmedExperts: [expert],
      expertComments: [expertComment],
    },
  });

  assert.equal(discardFailedDeliberationRequest(failedRequest), null);
  assert.deepEqual(
    discardFailedDeliberationRequest({
      endpoint: "respond",
      request: {
        consultation: "中学受験について相談したい",
        currentPhase: "premise",
        userQuestion,
        userQuestionAnswer: "まだ迷っている",
        memo,
      },
    }),
    {
      endpoint: "respond",
      request: {
        consultation: "中学受験について相談したい",
        currentPhase: "premise",
        userQuestion,
        userQuestionAnswer: "まだ迷っている",
        memo,
      },
    },
  );
});

test("整理リクエストの再試行中は専門家候補を編集できない", () => {
  assert.equal(isExpertDraftEditingDisabled(false, true), true);
  assert.equal(isExpertDraftEditingDisabled(true, false), true);
  assert.equal(isExpertDraftEditingDisabled(false, false), false);
});

test("専門家コメントの全件成功時は並列に開始し開始順で結果を返す", async () => {
  const startedRoles: string[] = [];
  let completeFirstRequest: (() => void) | undefined;
  const firstRequest = () => {
    startedRoles.push("教育相談員");
    return new Promise<ExpertComment>((resolve) => {
      completeFirstRequest = () =>
        resolve({ role_name: "教育相談員" } as ExpertComment);
    });
  };
  const secondRequest = async () => {
    startedRoles.push("家計相談員");
    return { role_name: "家計相談員" } as ExpertComment;
  };
  const resultPromise = collectExpertCommentGenerationResults([
    firstRequest,
    secondRequest,
  ]);

  assert.deepEqual(startedRoles, ["教育相談員", "家計相談員"]);
  completeFirstRequest?.();

  assert.deepEqual(await resultPromise, {
    comments: [{ role_name: "教育相談員" }, { role_name: "家計相談員" }],
    errorMessage: "",
  });
});

test("専門家コメントの一部失敗時は全件完了まで結果を返さず成功分を破棄する", async () => {
  let completePendingRequest: (() => void) | undefined;
  const pendingRequest = () =>
    new Promise<ExpertComment>((resolve) => {
      completePendingRequest = () =>
        resolve({ role_name: "家計相談員" } as ExpertComment);
    });
  const failedRequest = () => Promise.reject(new Error("生成失敗"));
  const resultPromise = collectExpertCommentGenerationResults([
    failedRequest,
    pendingRequest,
  ]);
  let isSettled = false;
  void resultPromise.then(() => {
    isSettled = true;
  });

  await Promise.resolve();
  assert.equal(isSettled, false);

  completePendingRequest?.();

  assert.deepEqual(await resultPromise, {
    comments: [],
    errorMessage:
      "専門家コメントの生成に失敗しました。もう一度お試しください。",
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

test("有効な整理応答だけを方向性整理へ進める", () => {
  const response = {
    current_phase: "direction",
    current_phase_label: "方向性整理",
    phase_goal: "判断軸を整理する",
    facilitator_message: "整理結果です。",
    next_action: "move_phase",
    user_question: null,
    expert_requests: [],
    memo_updates: memo,
  } satisfies FacilitatorResponse;

  assert.equal(isAcceptedM3FacilitatorResponse(response), true);
  assert.equal(
    isAcceptedM3FacilitatorResponse({
      ...response,
      next_action: "update_memo",
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

test("保存済み候補が上限を超える場合は確定できない", () => {
  const drafts = Array.from({ length: maximumExpertRequestCount + 1 }, () => ({
    ...expert,
  }));

  assert.deepEqual(confirmExpertDrafts(drafts), {
    experts: [],
    errorMessage: `確定する専門家ロールは${maximumExpertRequestCount}件以下にしてください。`,
  });
});

test("旧形式の専門家選定セッションでは応答候補を初期候補として復元する", () => {
  const response = { expert_requests: [expert] } as FacilitatorResponse;

  assert.deepEqual(
    getInitialExpertRequests(undefined, "expert_selection", response),
    [expert],
  );
});
