import assert from "node:assert/strict";
import test from "node:test";
import { StructuredOutputValidationError } from "../../../server/llm/types";
import {
  parseStructuredOutputOnceWithRetry,
  type StructuredOutputFailure,
} from "../../../server/routes/response-utils";

test("構造化出力の再試行には安全な理由付きJSON再生成指示を渡す", async () => {
  const attempts: Array<{ attempt?: number; repairInstruction?: string }> = [];
  const failures: StructuredOutputFailure[] = [];

  const output = await parseStructuredOutputOnceWithRetry(
    async (attempt) => {
      attempts.push(attempt ?? {});
      if (attempt?.attempt === 1) {
        throw new StructuredOutputValidationError({
          schemaName: "expert_comment",
          classification: "schema_validation",
          issues: [{ path: ["proposal", "content"], code: "too_big" }],
        });
      }
      return { answer: "再生成結果" };
    },
    (value) => value.answer === "再生成結果",
    (failure) => failures.push(failure),
  );

  assert.deepEqual(output, { answer: "再生成結果" });
  assert.deepEqual(failures, [
    {
      schemaName: "expert_comment",
      classification: "schema_validation",
      finishReason: undefined,
      issues: [{ path: ["proposal", "content"], code: "too_big" }],
      attempt: 1,
      terminationReason: "retry",
    },
  ]);
  assert.equal(attempts.length, 2);
  assert.match(
    attempts[1].repairInstruction ?? "",
    /failure_classification=schema_validation/,
  );
  assert.match(
    attempts[1].repairInstruction ?? "",
    /path=proposal.content,code=too_big/,
  );
  assert.doesNotMatch(
    attempts[1].repairInstruction ?? "",
    /expert_comment|再生成結果/,
  );
});

test("nullと後続検証失敗を安全な分類として通知する", async () => {
  const emptyFailures: StructuredOutputFailure[] = [];
  const postValidationFailures: StructuredOutputFailure[] = [];

  const emptyOutput = await parseStructuredOutputOnceWithRetry(
    async () => null,
    () => true,
    (failure) => emptyFailures.push(failure),
  );
  const postValidationOutput = await parseStructuredOutputOnceWithRetry(
    async () => ({ answer: "invalid" }),
    () => false,
    (failure) => postValidationFailures.push(failure),
  );

  assert.equal(emptyOutput, null);
  assert.deepEqual(
    emptyFailures.map((failure) => [
      failure.classification,
      failure.attempt,
      failure.terminationReason,
      failure.issues,
    ]),
    [
      ["empty_content", 1, "retry", []],
      ["empty_content", 2, "max_attempts", []],
    ],
  );
  assert.equal(postValidationOutput, null);
  assert.deepEqual(
    postValidationFailures.map((failure) => [
      failure.classification,
      failure.attempt,
      failure.terminationReason,
    ]),
    [
      ["post_validation", 1, "retry"],
      ["post_validation", 2, "max_attempts"],
    ],
  );
});
