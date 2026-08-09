import type { RequestHandler } from "express";
import {
  GroupChatExpertReplyRequestSchema,
  GroupChatMessageSchema,
  type GroupChatMessage,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
} from "./response-utils";
import type { AppDependencies } from "./types";

/** 指名専門家のグループチャット回答を生成するAPIハンドラを作成する。仕様対応: `docs/api/schemas.md#POST /api/expert/group-chat`。 */
export function createGroupChatExpertReplyHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = GroupChatExpertReplyRequestSchema.safeParse(
      request.body,
    );
    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error.flatten());
      return;
    }
    const existingMessageIds = new Set(
      parsedRequest.data.recentMessages.map((message) => message.id),
    );
    try {
      const output = await parseStructuredOutputOnceWithRetry<GroupChatMessage>(
        () =>
          dependencies.createLlmProvider().generateStructuredOutput({
            systemPrompt: groupChatExpertPrompt,
            userInput: parsedRequest.data,
            schema: GroupChatMessageSchema,
            schemaName: "group_chat_message",
          }),
        (message) =>
          GroupChatMessageSchema.safeParse(message).success &&
          !existingMessageIds.has(message.id),
      );
      if (!output) {
        sendInvalidModelResponse(request, response);
        return;
      }
      response.json({
        ...output,
        speakerType: "expert",
        speakerName: parsedRequest.data.expert.role_name,
        participantId: parsedRequest.data.expert.participantId,
      });
    } catch (error) {
      sendLlmRequestFailed(request, response, error);
    }
  };
}

/** グループチャット専門家回答用プロンプト。仕様対応: `docs/api/schemas.md#グループチャット`。 */
const groupChatExpertPrompt = `
あなたは指定された専門家です。指定schemaに従い、日本語で質問へ回答してください。

守ること:
- input.recentMessages に他の専門家の直近発言がある場合、その主張への賛成・留保・反論のいずれかを明確にし、理由または成立条件を述べる。
- input.discussionContext.selection を回答の起点にし、input.discussionContext.proposals の participantId、roleName、案名、内容、利点、犠牲にする点、成立条件を具体的に参照する。deep_dive では、自分の participantId が提案者なら根拠を擁護し、別の participantId が提案者なら具体的な反論・代替・成立条件を述べる。compare では2案のトレードオフを述べる。defer では全案を脱落させず比較軸を整理する。
- 初回コメントを言い換えるだけで終わらせず、ファシリテーターの質問に沿って議論を前進させる。
- 自分の指定観点を越えて結論を決めず、他の専門家の指名や次の進行は行わない。
`;
