import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

test("POST /api/session-memo/update returns a validated session memo", async () => {
  const response = await requestJson(
    createTestApp(memo),
    "/api/session-memo/update",
    { consultation: "相談内容", currentPhase: "deliberation" },
  );

  assert.equal(response.status, 200);
  assert.equal((response.body as { theme: string }).theme, "相談テーマ");
});

test("POST /api/session-memo/update reports a missing API key", async () => {
  const response = await requestJson(
    createTestApp(null, ""),
    "/api/session-memo/update",
    { consultation: "相談内容", currentPhase: "deliberation" },
  );

  assert.equal(response.status, 500);
  assert.equal(
    (response.body as { error: string }).error,
    "missing_llm_api_key",
  );
});
