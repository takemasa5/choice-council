import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { createApp } from "../server/app";

/**
 * APIテストで使う最小のセッションメモ。
 *
 * 日本語名: テスト用セッションメモ。
 */
export const memo = {
  theme: "相談テーマ",
  status: "in_progress" as const,
  facts: [],
  values: [],
  concerns: [],
  options: [],
  decision_axes: [],
  expert_summaries: [],
  conflicts: [],
  open_questions: [],
  next_actions: [],
};

/**
 * OpenAI APIを呼び出さないテスト用Expressアプリケーションを生成する。
 *
 * 日本語名: テスト用APIアプリ生成関数。
 */
export function createTestApp(output: unknown, apiKey = "test-api-key") {
  return createApp({
    getApiKey: () => apiKey,
    createOpenAIClient: () =>
      ({
        responses: {
          parse: async () => ({ output_parsed: output }),
        },
      }) as never,
  });
}

/**
 * 一時ポートで起動したExpressアプリケーションへJSONリクエストを送る。
 *
 * 日本語名: JSON APIリクエスト実行関数。
 */
export async function requestJson(app: Express, path: string, body?: unknown) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
