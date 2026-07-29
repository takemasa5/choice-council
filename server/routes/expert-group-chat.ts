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
const groupChatExpertPrompt =
  "あなたは指定された専門家です。指定schemaに従い、日本語で質問へ回答してください。";
