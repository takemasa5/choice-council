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
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    },
    max_completion_tokens: 1200,
    reasoning_effort: "low",
  });
});

test("Groqプロバイダーはネストした文字列と配列の未対応制約をJSON Schemaから除外する", async () => {
  const fakeClient = createGroqClient(
    '{"title":"回答","entries":[{"label":"項目","tags":["タグ"]}]}',
  );
  const provider = new GroqLlmProvider(
    "test-api-key",
    "groq-test",
    fakeClient.client as never,
  );
  const schema = z.strictObject({
    title: z.string().min(1).max(120),
    entries: z
      .array(
        z.strictObject({
          label: z.string().min(1).max(80),
          tags: z.array(z.string().min(1).max(80)).min(1).max(3),
        }),
      )
      .min(1)
      .max(3),
  });

  const output = await provider.generateStructuredOutput({
    systemPrompt: "prompt",
    userInput: {},
    schema,
    schemaName: "nested_output",
  });
  const request = fakeClient.getRequest() as {
    response_format: { json_schema: { schema: Record<string, unknown> } };
  };
  const requestSchema = request.response_format.json_schema.schema;
  const serializedSchema = JSON.stringify(requestSchema);

  assert.deepEqual(output, {
    title: "回答",
    entries: [{ label: "項目", tags: ["タグ"] }],
  });
  assert.deepEqual(requestSchema.required, ["title", "entries"]);
  assert.equal(requestSchema.additionalProperties, false);
  assert.match(serializedSchema, /"properties"/);
  assert.match(serializedSchema, /"items"/);
  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems"]) {
    assert.doesNotMatch(serializedSchema, new RegExp(`"${keyword}"`));
  }
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
  let requestedMaxCompletionTokens: unknown;

  globalThis.fetch = async (_input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    const request = JSON.parse(body) as Record<string, unknown>;
    requestedModel = request.model;
    requestedMaxCompletionTokens = request.max_completion_tokens;

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
    assert.equal(requestedMaxCompletionTokens, 1200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GROQ_MAX_OUTPUT_TOKENSの有効な値をGroqリクエストへ反映する", async () => {
  const originalFetch = globalThis.fetch;
  let requestedMaxCompletionTokens: unknown;

  globalThis.fetch = async (_input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    requestedMaxCompletionTokens = (JSON.parse(body) as Record<string, unknown>)
      .max_completion_tokens;

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
      GROQ_MAX_OUTPUT_TOKENS: "4096",
    });

    await provider.generateStructuredOutput({
      systemPrompt: "prompt",
      userInput: {},
      schema: z.strictObject({ answer: z.string() }),
      schemaName: "answer",
    });

    assert.equal(requestedMaxCompletionTokens, 4096);
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
