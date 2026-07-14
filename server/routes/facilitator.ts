import type { RequestHandler } from "express";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ConsultationRequestSchema,
  FacilitatorResponseSchema,
  type FacilitatorResponse,
  type Phase,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendMissingApiKey,
  sendOpenAIRequestFailed,
} from "./response-utils";
import type { AppDependencies } from "./types";

/**
 * フェーズを前後関係で判定するための並び順。
 *
 * 日本語名: 意思決定フェーズ順。
 * 仕様対応: `docs/design/state-machine.md#フェーズ`。
 */
const phaseOrder: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "direction",
  "final_memo",
];

/**
 * ファシリテーター初回応答を生成するAPIハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#ファシリテーター出力` と
 * `docs/prompts/facilitator.md`。
 */
export function createFacilitatorHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = ConsultationRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error.flatten());
      return;
    }

    const apiKey = dependencies.getApiKey();
    if (!apiKey) {
      sendMissingApiKey(response);
      return;
    }

    try {
      const client = dependencies.createOpenAIClient(apiKey);
      const output =
        await parseStructuredOutputOnceWithRetry<FacilitatorResponse>(
          () =>
            client.responses.parse({
              model: dependencies.getModel(),
              input: [
                developerMessage(facilitatorDeveloperPrompt),
                userMessage(parsedRequest.data),
              ],
              text: {
                format: zodTextFormat(
                  FacilitatorResponseSchema,
                  "facilitator_response",
                ),
              },
            }) as unknown as Promise<{
              output_parsed: FacilitatorResponse | null;
            }>,
          (modelResponse) =>
            isAcceptedFacilitatorResponse(
              parsedRequest.data.currentPhase,
              modelResponse,
            ),
        );

      if (!output) {
        sendInvalidModelResponse(response);
        return;
      }

      response.json(output);
    } catch (error) {
      sendOpenAIRequestFailed(response, error);
    }
  };
}

/** 日本語名: 開発者メッセージをResponses API形式へ変換する関数。 */
function developerMessage(text: string) {
  return {
    role: "developer" as const,
    content: [{ type: "input_text" as const, text }],
  };
}

/** 日本語名: ユーザー入力をResponses API形式へ変換する関数。 */
function userMessage(value: unknown) {
  return {
    role: "user" as const,
    content: [
      { type: "input_text" as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

/**
 * モデルが提案したフェーズ遷移をアプリ側の状態機械に照らして判定する。
 *
 * 仕様対応: `docs/design/state-machine.md#フェーズ遷移ルール`。
 */
function isAcceptedFacilitatorResponse(
  currentPhase: Phase | undefined,
  modelResponse: FacilitatorResponse,
) {
  const activePhase = currentPhase ?? "consultation_input";
  const currentIndex = phaseOrder.indexOf(activePhase);
  const modelIndex = phaseOrder.indexOf(modelResponse.current_phase);

  if (modelIndex === currentIndex) return true;
  if (modelIndex !== currentIndex + 1) return false;
  if (activePhase === "consultation_input") return true;
  if (modelResponse.user_question?.required) return false;

  return (
    modelResponse.next_action === "move_phase" ||
    modelResponse.next_action === "finish"
  );
}

/**
 * ファシリテーターへ渡す開発者プロンプト。
 *
 * 日本語名: ファシリテーター開発者プロンプト。
 * 仕様対応: `docs/prompts/facilitator.md`。
 */
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
- currentPhase と memo が入力に含まれる場合は、そのフェーズとメモを現在の文脈として扱う。
- currentPhase が premise 以降の場合、出力の current_phase は入力の currentPhase または状態機械上の次フェーズにする。
- userQuestion と userQuestionAnswer が入力に含まれる場合は、その質問へのユーザー回答として扱い、memo_updates と次アクションに反映する。
- user_question を返す場合、options は2件以上にし、必ず「その他」を含める。
- 出力は指定 schema に厳密に従う。
`;
