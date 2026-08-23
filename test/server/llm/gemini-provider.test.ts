import assert from "node:assert/strict";
import test from "node:test";
import { GeminiLlmProvider } from "../../../server/llm/gemini-provider";
import { StructuredOutputValidationError } from "../../../server/llm/types";
import { z } from "zod";

/** Gemini SDKを呼び出さずに出力形式を確認する最小クライアント。 */
function createGeminiClient(responseText: string | undefined) {
  let request: unknown;

  return {
    client: {
      models: {
        generateContent: async (value: unknown) => {
          request = value;
          return { text: responseText };
        },
      },
    },
    getRequest: () => request,
  };
}

test("GeminiプロバイダーはJSON Schemaで構造化出力を要求してZod検証済みの結果を返す", async () => {
  const fakeClient = createGeminiClient('{"answer":"回答"}');
  const provider = new GeminiLlmProvider(
    "test-api-key",
    "gemini-test",
    fakeClient.client as never,
  );
  const schema = z.strictObject({ answer: z.string().min(1) });

  const output = await provider.generateStructuredOutput({
    systemPrompt: "日本語で回答する",
    userInput: { question: "質問" },
    schema,
    schemaName: "answer",
  });

  assert.deepEqual(output, { answer: "回答" });
  assert.deepEqual(fakeClient.getRequest(), {
    model: "gemini-test",
    contents: '{\n  "question": "質問"\n}',
    config: {
      systemInstruction: "日本語で回答する",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: { answer: { type: "string", minLength: 1 } },
        required: ["answer"],
        additionalProperties: false,
      },
    },
  });
});

test("Geminiプロバイダーは構造化出力失敗を安全な分類で伝える", async () => {
  const emptyContentClient = createGeminiClient(undefined);
  const malformedClient = createGeminiClient("モデル本文の秘密値");
  const invalidOutputClient = createGeminiClient('{"answer":""}');
  const schema = z.strictObject({ answer: z.string().min(1) });

  const emptyContentProvider = new GeminiLlmProvider(
    "test-api-key",
    "gemini-test",
    emptyContentClient.client as never,
  );
  const malformedProvider = new GeminiLlmProvider(
    "test-api-key",
    "gemini-test",
    malformedClient.client as never,
  );
  const invalidOutputProvider = new GeminiLlmProvider(
    "test-api-key",
    "gemini-test",
    invalidOutputClient.client as never,
  );

  await assertSafeStructuredOutputError(
    () =>
      emptyContentProvider.generateStructuredOutput({
        systemPrompt: "prompt",
        userInput: { question: "入力の秘密値" },
        schema,
        schemaName: "answer",
      }),
    { classification: "empty_content", issues: [] },
  );
  await assertSafeStructuredOutputError(
    () =>
      malformedProvider.generateStructuredOutput({
        systemPrompt: "prompt",
        userInput: { question: "入力の秘密値" },
        schema,
        schemaName: "answer",
      }),
    { classification: "invalid_json", issues: [] },
  );
  await assertSafeStructuredOutputError(
    () =>
      invalidOutputProvider.generateStructuredOutput({
        systemPrompt: "prompt",
        userInput: { question: "入力の秘密値" },
        schema,
        schemaName: "answer",
      }),
    {
      classification: "schema_validation",
      issues: [{ path: ["answer"], code: "too_small" }],
    },
  );
});

/** 構造化出力エラーがモデル本文・入力を含まないことも合わせて検証する。 */
async function assertSafeStructuredOutputError(
  request: () => Promise<unknown>,
  expected: {
    classification: "empty_content" | "invalid_json" | "schema_validation";
    issues: Array<{ path: Array<string | number>; code: string }>;
  },
) {
  await assert.rejects(request, (error: unknown) => {
    assert.ok(error instanceof StructuredOutputValidationError);
    assert.equal(error.schemaName, "answer");
    assert.equal(error.classification, expected.classification);
    assert.deepEqual(error.issues, expected.issues);
    assert.equal(error.message, "Structured output validation failed.");
    assert.doesNotMatch(JSON.stringify(error), /秘密値/);
    return true;
  });
}

test("Geminiプロバイダーは再生成指示がある場合だけsystemInstructionへ追記する", async () => {
  const fakeClient = createGeminiClient('{"answer":"回答"}');
  const provider = new GeminiLlmProvider(
    "test-api-key",
    "gemini-test",
    fakeClient.client as never,
  );
  const schema = z.strictObject({ answer: z.string().min(1) });

  await provider.generateStructuredOutput({
    systemPrompt: "開発者指示",
    userInput: { question: "質問" },
    schema,
    schemaName: "answer",
  });
  assert.equal(
    (
      fakeClient.getRequest() as {
        config: { systemInstruction: string };
      }
    ).config.systemInstruction,
    "開発者指示",
  );

  await provider.generateStructuredOutput({
    systemPrompt: "開発者指示",
    userInput: { question: "質問" },
    schema,
    schemaName: "answer",
    repairInstruction:
      "指定schemaを満たすJSONだけを再生成してください。 failure_classification=schema_validation.",
  });
  assert.equal(
    (
      fakeClient.getRequest() as {
        config: { systemInstruction: string };
      }
    ).config.systemInstruction,
    "開発者指示\n\n指定schemaを満たすJSONだけを再生成してください。 failure_classification=schema_validation.",
  );
});
