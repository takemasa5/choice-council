import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, requestJson } from "../../../test-support/server";

test("GET /api/health returns the health status", async () => {
  const response = await requestJson(createTestApp(null), "/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});
