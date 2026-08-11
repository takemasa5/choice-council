import assert from "node:assert/strict";
import test from "node:test";
import { createLlmProviderFromEnvironment } from "../../../server/llm/create-provider";
import { GroqLlmProvider } from "../../../server/llm/groq-provider";
import { z } from "zod";

/** Groq SDKを呼び出さずにChat Completionsリクエストを確認する最小クライアント。 */
function createGroqClient(content: string | null) {
  let request: unknown;

  return {
    client: {
      chat: {
        completions: {
          create: async (value: unknown) => {
            request = value;
            return { choices: [{ message: { content } }] };
          },
        },
      },
    },
    getRequest: () => request,
  };
}

test("Groqプロバイダーはstrict JSON Schemaで構造化出力を要求してZod検証済みの結果を返す", async () => {
  const fakeClient = createGroqClient('{"answer":"回答"}');
  const provider = new GroqLlmProvider(
    "test-api-key",
    "groq-test",
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
    model: "groq-test",
    messages: [
      { role: "developer", content: "日本語で回答する" },
      { role: "user", content: '{\n  "question": "質問"\n}' },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "answer",
        strict: true,
        schema: {
          type: "object",
          properties: { answer: { type: "string", minLength: 1 } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    },
    reasoning_effort: "low",
  });
});

test("Groqプロバイダーはcontentがない場合にnullを返す", async () => {
  const fakeClient = createGroqClient(null);
  const provider = new GroqLlmProvider(
    "test-api-key",
    "groq-test",
    fakeClient.client as never,
  );

  const output = await provider.generateStructuredOutput({
    systemPrompt: "prompt",
    userInput: {},
    schema: z.strictObject({ answer: z.string() }),
    schemaName: "answer",
  });

  assert.equal(output, null);
});

test("GROQ_MODEL未指定時はGPT-OSS 120Bを指定してGroqへリクエストする", async () => {
  const originalFetch = globalThis.fetch;
  let requestedModel: unknown;

  globalThis.fetch = async (_input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    requestedModel = JSON.parse(body).model;

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"answer":"回答"}' } }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = createLlmProviderFromEnvironment({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test-api-key",
    });

    await provider.generateStructuredOutput({
      systemPrompt: "prompt",
      userInput: {},
      schema: z.strictObject({ answer: z.string() }),
      schemaName: "answer",
    });

    assert.equal(requestedModel, "openai/gpt-oss-120b");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groqプロバイダーは不正なJSONをrejectし、Zod schema違反をnullとして扱う", async () => {
  const malformedClient = createGroqClient("not-json");
  const invalidOutputClient = createGroqClient('{"answer":""}');
  const schema = z.strictObject({ answer: z.string().min(1) });
  const malformedProvider = new GroqLlmProvider(
    "test-api-key",
    "groq-test",
    malformedClient.client as never,
  );
  const invalidOutputProvider = new GroqLlmProvider(
    "test-api-key",
    "groq-test",
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
