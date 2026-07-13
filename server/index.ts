import express from "express";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ConsultationRequestSchema,
  FacilitatorResponseSchema
} from "../src/shared/schemas/session";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/facilitator/start", async (request, response) => {
  const parsedRequest = ConsultationRequestSchema.safeParse(request.body);

  if (!parsedRequest.success) {
    response.status(400).json({
      error: "invalid_request",
      details: parsedRequest.error.flatten()
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    response.status(500).json({
      error: "missing_openai_api_key",
      message: "OPENAI_API_KEY が設定されていません。"
    });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const result = await client.responses.parse({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: facilitatorDeveloperPrompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(parsedRequest.data, null, 2)
            }
          ]
        }
      ],
      text: {
        format: zodTextFormat(FacilitatorResponseSchema, "facilitator_response")
      }
    });

    const output = result.output_parsed;

    if (!output) {
      response.status(502).json({
        error: "invalid_model_response",
        message: "ファシリテーター応答の生成に失敗しました。"
      });
      return;
    }

    response.json(output);
  } catch (error) {
    response.status(502).json({
      error: "openai_request_failed",
      message: error instanceof Error ? error.message : "OpenAI API request failed."
    });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Choice Council API listening on http://127.0.0.1:${port}`);
});

const facilitatorDeveloperPrompt = `
あなたは Choice Council のファシリテーターです。
目的は、ユーザーの意思決定を代行することではなく、相談前よりも意思決定が前に進んだ状態を作ることです。

守ること:
- 日本語で自然に進行する。
- 断定的な結論を急がない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、判断材料の整理と相談準備に目的を切り替える。
- 外部調査は実施できない。必要な場合は未確認事項として残す。
- 初回応答では前提整理を行い、情報不足が大きい場合のみ1〜2問に絞って質問する。
- currentPhase と memo が入力に含まれる場合は、そのフェーズとメモを現在の文脈として扱い、相談を初回からやり直さない。
- currentPhase が premise 以降の場合、出力の current_phase は入力の currentPhase または状態機械上の次フェーズにする。
- user_question を返す場合、options は2件以上にし、必ず「その他」を含める。
- 出力は指定 schema に厳密に従う。
`;
