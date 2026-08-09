import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, requestJson } from "../../../test-support/server";

test("POST /api/expert/comment preserves the requested expert identity", async () => {
  let prompt = "";
  const response = await requestJson(
    createTestApp(
      {
        role_name: "モデル側のロール",
        viewpoint: "モデル側の観点",
        summary: "専門家コメントです。",
        proposal: {
          id: "proposal-model",
          name: "モデル側の案",
          content: "具体案です。",
          benefits: ["利点です。"],
          sacrifices: ["犠牲です。"],
          conditions: ["条件です。"],
        },
        key_point: "要点です。",
        concern: "懸念です。",
        question_to_user: "なし",
        confidence: "medium",
        needs_research: false,
      },
      "test-api-key",
      (request) => {
        prompt = JSON.stringify(request);
      },
    ),
    "/api/expert/comment",
    {
      consultation: "相談内容",
      currentPhase: "deliberation",
      expert: {
        role_name: "家計担当",
        viewpoint: "費用",
        request: "費用を確認",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal((response.body as { role_name: string }).role_name, "家計担当");
  assert.equal((response.body as { viewpoint: string }).viewpoint, "費用");
  assert.match(prompt, /ない場合も「現時点では特になし」と明示する/);
});

test("POST /api/expert/comment rejects invalid input", async () => {
  const response = await requestJson(
    createTestApp(null),
    "/api/expert/comment",
    {},
  );

  assert.equal(response.status, 400);
  assert.equal((response.body as { error: string }).error, "invalid_request");
});
