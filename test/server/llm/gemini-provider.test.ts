import assert from "node:assert/strict";
import test from "node:test";
import { GeminiLlmProvider } from "../../../server/llm/gemini-provider";
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

test("Geminiプロバイダーは不正なJSONまたはZod schema違反を構造化出力失敗として扱う", async () => {
  const malformedClient = createGeminiClient("not-json");
  const invalidOutputClient = createGeminiClient('{"answer":""}');
  const schema = z.strictObject({ answer: z.string().min(1) });

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

  await assert.rejects(() =>
    malformedProvider.generateStructuredOutput({
      systemPrompt: "prompt",
      userInput: {},
      schema,
      schemaName: "answer",
    }),
  );
  assert.equal(
    await invalidOutputProvider.generateStructuredOutput({
      systemPrompt: "prompt",
      userInput: {},
      schema,
      schemaName: "answer",
    }),
    null,
  );
});

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
