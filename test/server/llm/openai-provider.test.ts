import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiLlmProvider } from "../../../server/llm/openai-provider";
import { z } from "zod";

/** OpenAI SDKを呼び出さずにResponses APIリクエストを確認する最小クライアント。 */
function createOpenAiClient(output: unknown) {
  const requests: unknown[] = [];

  return {
    client: {
      responses: {
        parse: async (request: unknown) => {
          requests.push(request);
          return { output_parsed: output };
        },
      },
    },
    getRequests: () => requests,
  };
}

test("OpenAIプロバイダーは再生成指示がある場合だけdeveloper inputへ追記する", async () => {
  const fakeClient = createOpenAiClient({ answer: "回答" });
  const provider = new OpenAiLlmProvider(
    "test-api-key",
    "openai-test",
    fakeClient.client as never,
  );
  const schema = z.strictObject({ answer: z.string().min(1) });

  await provider.generateStructuredOutput({
    systemPrompt: "開発者指示",
    userInput: { question: "質問" },
    schema,
    schemaName: "answer",
  });
  await provider.generateStructuredOutput({
    systemPrompt: "開発者指示",
    userInput: { question: "質問" },
    schema,
    schemaName: "answer",
    repairInstruction:
      "指定schemaを満たすJSONだけを再生成してください。 failure_classification=schema_validation.",
  });

  const requests = fakeClient.getRequests() as Array<{
    input: Array<{
      role: "developer" | "user";
      content: Array<{ type: "input_text"; text: string }>;
    }>;
  }>;
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0]?.input, [
    {
      role: "developer",
      content: [{ type: "input_text", text: "開発者指示" }],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: '{\n  "question": "質問"\n}' }],
    },
  ]);
  assert.equal(
    requests[1]?.input[0]?.content[0]?.text,
    "開発者指示\n\n指定schemaを満たすJSONだけを再生成してください。 failure_classification=schema_validation.",
  );
  assert.equal(
    requests[1]?.input[1]?.content[0]?.text,
    '{\n  "question": "質問"\n}',
  );
});
