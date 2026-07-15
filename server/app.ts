import express from "express";
import OpenAI from "openai";
import { createExpertCommentHandler } from "./routes/expert-comment";
import {
  createFacilitatorDeliberationHandler,
  createFacilitatorRespondHandler,
  createFacilitatorStartHandler,
} from "./routes/facilitator";
import { createFinalMarkdownHandler } from "./routes/final-markdown";
import { healthHandler } from "./routes/health";
import { createSessionMemoHandler } from "./routes/session-memo";
import type { AppDependencies } from "./routes/types";

/**
 * Choice Council のExpressアプリケーションを生成する。
 *
 * 仕様対応: `docs/api/schemas.md` の4つのLLM呼び出し契約と
 * `docs/design/state-machine.md` のフェーズ進行をHTTP APIとして公開する。
 */
export function createApp(overrides: Partial<AppDependencies> = {}) {
  /** APIハンドラへ渡す外部依存の実装。 */
  const dependencies: AppDependencies = {
    createOpenAIClient: (apiKey) => new OpenAI({ apiKey }),
    getApiKey: () => process.env.OPENAI_API_KEY,
    getModel: () => process.env.OPENAI_MODEL ?? "gpt-5-mini",
    ...overrides,
  };
  /** HTTPリクエストを処理するExpressアプリケーション。 */
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  // 仕様対応: `docs/api/schemas.md#呼び出し単位` の公開エンドポイント。
  app.get("/api/health", healthHandler);
  app.post(
    "/api/facilitator/start",
    createFacilitatorStartHandler(dependencies),
  );
  app.post(
    "/api/facilitator/respond",
    createFacilitatorRespondHandler(dependencies),
  );
  app.post(
    "/api/facilitator/deliberation",
    createFacilitatorDeliberationHandler(dependencies),
  );
  app.post("/api/expert/comment", createExpertCommentHandler(dependencies));
  app.post("/api/session-memo/update", createSessionMemoHandler(dependencies));
  app.post(
    "/api/final-markdown/generate",
    createFinalMarkdownHandler(dependencies),
  );

  return app;
}
