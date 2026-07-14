import express, { type Response } from "express";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import {
  ConsultationRequestSchema,
  ExpertCommentRequestSchema,
  ExpertCommentSchema,
  FacilitatorResponseSchema,
  FinalMarkdownRequestSchema,
  FinalMarkdownSchema,
  SessionMemoRequestSchema,
  SessionMemoSchema
} from "../src/shared/schemas/session";
import type {
  ExpertComment,
  FacilitatorResponse,
  FinalMarkdown,
  Phase,
  SessionMemo
} from "../src/shared/schemas/session";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const invalidModelResponseMessage = "この発言の生成に失敗しました。再生成できます。";
const phaseOrder: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "direction",
  "final_memo"
];

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
    const output = await parseStructuredOutputOnceWithRetry<FacilitatorResponse>(
      () =>
        client.responses.parse({
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
        }),
      (response) => isAcceptedFacilitatorResponse(parsedRequest.data.currentPhase, response)
    );

    if (!output) {
      sendInvalidModelResponse(response);
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

app.post("/api/expert/comment", async (request, response) => {
  const parsedRequest = ExpertCommentRequestSchema.safeParse(request.body);

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
    const output = await parseStructuredOutputOnceWithRetry<ExpertComment>(() =>
      client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: expertDeveloperPrompt
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
          format: zodTextFormat(ExpertCommentSchema, "expert_comment")
        }
      })
    );

    if (!output) {
      sendInvalidModelResponse(response);
      return;
    }

    response.json({
      ...output,
      role_name: parsedRequest.data.expert.role_name,
      viewpoint: parsedRequest.data.expert.viewpoint
    });
  } catch (error) {
    response.status(502).json({
      error: "openai_request_failed",
      message: error instanceof Error ? error.message : "OpenAI API request failed."
    });
  }
});

app.post("/api/session-memo/update", async (request, response) => {
  const parsedRequest = SessionMemoRequestSchema.safeParse(request.body);

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
    const output = await parseStructuredOutputOnceWithRetry<SessionMemo>(() =>
      client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: sessionMemoDeveloperPrompt
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
          format: zodTextFormat(SessionMemoSchema, "session_memo")
        }
      })
    );

    if (!output) {
      sendInvalidModelResponse(response);
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

app.post("/api/final-markdown/generate", async (request, response) => {
  const parsedRequest = FinalMarkdownRequestSchema.safeParse(request.body);

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
    const expectedStatusLabel = finalMemoStatusLabels[parsedRequest.data.memo.status];
    const output = await parseStructuredOutputOnceWithRetry<FinalMarkdown>(
      () =>
        client.responses.parse({
          model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
          input: [
            {
              role: "developer",
              content: [
                {
                  type: "input_text",
                  text: finalMarkdownDeveloperPrompt
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
            format: zodTextFormat(FinalMarkdownSchema, "final_markdown")
          }
        }),
      (output) => getMarkdownSection(output.markdown, "## 現時点の状態").includes(expectedStatusLabel)
    );

    if (!output) {
      sendInvalidModelResponse(response);
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

async function parseStructuredOutputOnceWithRetry<T>(
  request: () => Promise<{ output_parsed: T | null }>,
  isValid: (output: T) => boolean = () => true
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request().catch((error: unknown) => {
      if (isStructuredOutputParseError(error)) {
        return null;
      }

      throw error;
    });

    if (!result) {
      continue;
    }

    const output = result.output_parsed;

    if (output && isValid(output)) {
      return output;
    }
  }

  return null;
}

function sendInvalidModelResponse(response: Response) {
  response.status(502).json({
    error: "invalid_model_response",
    message: invalidModelResponseMessage
  });
}

function isStructuredOutputParseError(error: unknown) {
  return error instanceof SyntaxError || error instanceof ZodError;
}

function isAcceptedFacilitatorResponse(
  currentPhase: Phase | undefined,
  response: FacilitatorResponse
) {
  const activePhase = currentPhase ?? "consultation_input";
  const currentIndex = phaseOrder.indexOf(activePhase);
  const modelIndex = phaseOrder.indexOf(response.current_phase);

  if (modelIndex === currentIndex) return true;
  if (modelIndex !== currentIndex + 1) return false;

  if (activePhase === "consultation_input") return true;
  if (response.user_question?.required) return false;

  return response.next_action === "move_phase" || response.next_action === "finish";
}

const facilitatorDeveloperPrompt = `
あなたは Choice Council のファシリテーターです。
目的は、ユーザーの意思決定を代行することではなく、相談前よりも意思決定が前に進んだ状態を作ることです。

守ること:
- 日本語で自然に進行する。
- 断定的な結論を急がない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、判断材料の整理と相談準備に目的を切り替える。
- 外部調査は実施できない。必要な場合は未確認事項として残す。
- 初回応答では相談内容を要約し、事実、希望、不安、不明点を整理する。
- 初回応答で外部調査が必要な内容は断定せず、memo_updates.open_questions に未確認事項として残す。
- 初回応答では情報不足が大きい場合のみ1〜2問に絞って質問する。
- 初回応答では次に必要な専門家ロール候補を expert_requests に含める。専門家が重視する観点は viewpoint に明示する。
- 高リスク領域では専門家ロール候補や次アクションを、判断材料の整理と相談準備に向ける。
- currentPhase と memo が入力に含まれる場合は、そのフェーズとメモを現在の文脈として扱い、相談を初回からやり直さない。
- currentPhase が premise 以降の場合、出力の current_phase は入力の currentPhase または状態機械上の次フェーズにする。
- userQuestion と userQuestionAnswer が入力に含まれる場合は、その質問へのユーザー回答として扱い、memo_updates と次アクションに反映する。
- user_question を返す場合、options は2件以上にし、必ず「その他」を含める。
- 出力は指定 schema に厳密に従う。
`;

const expertDeveloperPrompt = `
あなたは Choice Council の専門家ロールです。
人間的なキャラクターではなく、指定された役割と観点からだけ発言します。

守ること:
- 日本語で短く具体的に述べる。
- 入力された expert.role_name と expert.viewpoint をそのまま使い、観点を推測で補完しない。
- expert.request に答える。
- 通常表示用の summary は300〜400字程度に整える。
- 最重要ポイントを key_point に1つだけ示す。
- 気になるリスクや不明点を concern に示す。ない場合も「現時点では特になし」と明示する。
- 必要な場合のみ question_to_user にユーザーへの質問を1つ出す。不要な場合は「なし」とする。
- 外部調査が必要な内容は断定せず、needs_research を true にする。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に限定する。
- 出力は指定 schema に厳密に従う。
`;

const sessionMemoDeveloperPrompt = `
あなたは Choice Council のセッションメモ更新担当です。
フェーズ区切り、または重要な整理が終わったタイミングで、これまでの文脈をセッションメモに反映します。

守ること:
- 日本語で簡潔に整理する。
- previousMemo がある場合は、丸ごと捨てずに新しい整理内容を反映した最新版にする。
- facilitatorResponse がある場合は、facilitator_message、user_question、memo_updates、next_action を現在の整理として扱う。
- expertComments がある場合は、専門家コメントの要約、要点、懸念を expert_summaries に反映する。
- needs_research が true の専門家懸念と、「なし」以外の question_to_user は open_questions に残す。
- userAction がある場合は、ユーザー操作として次アクションや未確認事項へ必要な範囲で反映する。
- 外部調査は実施できない。必要な情報は未確認事項として残す。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に留める。
- 出力は指定 schema に厳密に従う。
`;

const finalMarkdownDeveloperPrompt = `
あなたは Choice Council の終了メモ作成担当です。
ユーザーが後で見返せる意思決定メモを Markdown 形式で作成します。

守ること:
- 日本語で簡潔に整理する。
- 最終結論が出ていない場合も、memo.status に対応する現時点の状態を明示する。
- memo.status は次の表示ラベルとして「現時点の状態」に必ず含める。
  - tentative_conclusion: 暫定結論
  - pending_decision: 判断保留
  - pending_research: 追加調査待ち
  - pending_family_discussion: 家族・関係者相談待ち
  - action_plan: 実行計画
- 相談テーマ、現時点の状態、重視した価値観、未確認事項、次アクションを必ず含める。
- Markdown の見出しは次の構成と表記に完全一致させ、順番も守る。
  - # 意思決定メモ
  - ## 相談テーマ
  - ## 現時点の状態
  - ## 重視した価値観
  - ## 整理した事実
  - ## 検討した選択肢
  - ## 主な判断軸
  - ## 専門家コメント要約
  - ## 意見が割れた点
  - ## 未確認事項
  - ## 次アクション
  - ## セッションログ要約
- 専門家コメントは要点だけに整理する。
- 断定できないことを断定しない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に留める。
- 出力は指定 schema に厳密に従う。
`;

const finalMemoStatusLabels = {
  tentative_conclusion: "暫定結論",
  pending_decision: "判断保留",
  pending_research: "追加調査待ち",
  pending_family_discussion: "家族・関係者相談待ち",
  action_plan: "実行計画"
} as const;

function getMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    return "";
  }

  const sectionLines: string[] = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (/^#{1,2}\s/.test(line.trim())) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join("\n");
}
