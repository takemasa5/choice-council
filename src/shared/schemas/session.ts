import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString);
/**
 * 選択・確定できる専門家ロール数の上限。
 *
 * 仕様対応: `docs/api/schemas.md#初回専門家コメント生成`。
 */
export const maximumExpertRequestCount = 5;
/**
 * LLM に送信するグループチャット直近発言数の上限。
 *
 * 仕様対応: `docs/api/schemas.md#グループチャット`。
 */
export const recentGroupChatMessageLimit = 8;
const finalMarkdownRequiredHeadings = [
  "# 意思決定メモ",
  "## 相談テーマ",
  "## 現時点の状態",
  "## 重視した価値観",
  "## 整理した事実",
  "## 検討した選択肢",
  "## 主な判断軸",
  "## 専門家コメント要約",
  "## 意見が割れた点",
  "## 未確認事項",
  "## 次アクション",
  "## セッションログ要約",
] as const;

const finalMemoStatusLabels = [
  "暫定結論",
  "判断保留",
  "追加調査待ち",
  "家族・関係者相談待ち",
  "実行計画",
] as const;

export const PhaseSchema = z.enum([
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "group_chat",
  "final_memo",
]);

export type Phase = z.infer<typeof PhaseSchema>;

export const UserQuestionSchema = z
  .strictObject({
    question: nonEmptyString,
    options: nonEmptyStringArray.min(2),
    required: z.boolean(),
  })
  .superRefine((question, context) => {
    if (!question.options.includes("その他")) {
      context.addIssue({
        code: "custom",
        message: "user_question.options must include その他",
        path: ["options"],
      });
    }
  });

export const SessionMemoStatusSchema = z.enum([
  "in_progress",
  "tentative_conclusion",
  "pending_decision",
  "pending_research",
  "pending_family_discussion",
  "action_plan",
]);

export type SessionMemoStatus = z.infer<typeof SessionMemoStatusSchema>;

export const FinalMemoStatusSchema = z.enum([
  "tentative_conclusion",
  "pending_decision",
  "pending_research",
  "pending_family_discussion",
  "action_plan",
]);

export type FinalMemoStatus = z.infer<typeof FinalMemoStatusSchema>;

export const SessionMemoSchema = z.strictObject({
  theme: nonEmptyString,
  status: SessionMemoStatusSchema,
  facts: nonEmptyStringArray,
  values: nonEmptyStringArray,
  concerns: nonEmptyStringArray,
  options: nonEmptyStringArray,
  decision_axes: nonEmptyStringArray,
  expert_summaries: nonEmptyStringArray,
  conflicts: nonEmptyStringArray,
  open_questions: nonEmptyStringArray,
  next_actions: nonEmptyStringArray,
});

export type SessionMemo = z.infer<typeof SessionMemoSchema>;

export const FinalSessionMemoSchema = SessionMemoSchema.extend({
  status: FinalMemoStatusSchema,
});

export type FinalSessionMemo = z.infer<typeof FinalSessionMemoSchema>;

/**
 * 相談開始 API の入力契約。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/start`。
 */
export const ConsultationStartRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  facts: nonEmptyString.optional(),
  values: nonEmptyString.optional(),
  concerns: nonEmptyString.optional(),
  expectedOutcome: nonEmptyString.optional(),
});

/** 日本語名: 相談開始リクエスト。 */
export type ConsultationStartRequest = z.infer<
  typeof ConsultationStartRequestSchema
>;

/**
 * 前提整理の確認回答 API の入力契約。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/respond`。
 */
export const FacilitatorResponseRequestSchema = z
  .strictObject({
    consultation: nonEmptyString,
    currentPhase: z.literal("premise"),
    userQuestion: UserQuestionSchema,
    userQuestionAnswer: nonEmptyString,
    memo: SessionMemoSchema,
  })
  .superRefine((request, context) => {
    if (!request.userQuestion.required) {
      context.addIssue({
        code: "custom",
        message: "userQuestion.required must be true",
        path: ["userQuestion", "required"],
      });
    }
  });

/** 日本語名: ファシリテーター確認回答リクエスト。 */
export type FacilitatorResponseRequest = z.infer<
  typeof FacilitatorResponseRequestSchema
>;

/**
 * クライアントが開始入力と確認回答を一時保持するための互換用契約。
 *
 * API の受け付けは `ConsultationStartRequestSchema` と
 * `FacilitatorResponseRequestSchema` を使用する。
 */
export const ConsultationRequestSchema = z.strictObject({
  ...ConsultationStartRequestSchema.shape,
  userQuestion: UserQuestionSchema.optional(),
  userQuestionAnswer: nonEmptyString.optional(),
  currentPhase: PhaseSchema.optional(),
  memo: SessionMemoSchema.optional(),
});

/** 日本語名: クライアント互換用の相談リクエスト。 */
export type ConsultationRequest = z.infer<typeof ConsultationRequestSchema>;

export const ExpertRequestSchema = z.strictObject({
  role_name: nonEmptyString,
  viewpoint: nonEmptyString,
  request: nonEmptyString,
});

export type ExpertRequest = z.infer<typeof ExpertRequestSchema>;

export const ExpertCommentRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: PhaseSchema,
  memo: SessionMemoSchema.optional(),
  expert: ExpertRequestSchema,
});

export type ExpertCommentRequest = z.infer<typeof ExpertCommentRequestSchema>;

export const ExpertCommentSchema = z.strictObject({
  role_name: nonEmptyString,
  viewpoint: nonEmptyString,
  summary: nonEmptyString,
  key_point: nonEmptyString,
  concern: nonEmptyString,
  question_to_user: nonEmptyString,
  confidence: z.enum(["high", "medium", "low"]),
  needs_research: z.boolean(),
});

export type ExpertComment = z.infer<typeof ExpertCommentSchema>;

/**
 * グループチャットの専門家を一意に識別する確定済みロール。
 *
 * 仕様対応: `docs/api/schemas.md#グループチャット`。
 */
export const GroupChatExpertSchema = ExpertRequestSchema.extend({
  participantId: nonEmptyString,
});

/** 日本語名: グループチャット参加専門家。 */
export type GroupChatExpert = z.infer<typeof GroupChatExpertSchema>;

/**
 * 画面に表示するグループチャット発言。
 *
 * 仕様対応: `docs/api/schemas.md#グループチャット`。
 */
export const GroupChatMessageSchema = z.strictObject({
  id: nonEmptyString,
  speakerType: z.enum(["facilitator", "expert", "user"]),
  speakerName: nonEmptyString,
  participantId: nonEmptyString,
  content: nonEmptyString,
  createdAt: nonEmptyString,
});

/** 日本語名: グループチャット発言。 */
export type GroupChatMessage = z.infer<typeof GroupChatMessageSchema>;

const RequestedSpeakerSchema = z.strictObject({
  speakerType: z.enum(["expert", "user"]),
  speakerName: nonEmptyString,
  participantId: nonEmptyString,
});

/**
 * 次の発言者を指名するファシリテーターターン。
 *
 * 仕様対応: `docs/api/schemas.md#グループチャット`。
 */
export const FacilitatorTurnSchema = z
  .strictObject({
    message: nonEmptyString,
    requestedSpeaker: RequestedSpeakerSchema,
    requestReason: nonEmptyString,
    question: nonEmptyString,
    userOptions: nonEmptyStringArray.nullable(),
    memoUpdate: SessionMemoSchema.nullable(),
    contextSummaryUpdate: nonEmptyString.nullable(),
  })
  .superRefine((turn, context) => {
    if (turn.requestedSpeaker.speakerType === "user") {
      if (!turn.userOptions || turn.userOptions.length < 2) {
        context.addIssue({
          code: "custom",
          message: "userOptions are required for user",
          path: ["userOptions"],
        });
        return;
      }
      if (!turn.userOptions.includes("そのまま意見交換を続けて")) {
        context.addIssue({
          code: "custom",
          message: "userOptions must include そのまま意見交換を続けて",
          path: ["userOptions"],
        });
      }
      if (new Set(turn.userOptions).size !== turn.userOptions.length) {
        context.addIssue({
          code: "custom",
          message: "userOptions must not contain duplicates",
          path: ["userOptions"],
        });
      }
      if (turn.userOptions.includes("その他")) {
        context.addIssue({
          code: "custom",
          message: "userOptions must not include その他",
          path: ["userOptions"],
        });
      }
    } else if (turn.userOptions !== null) {
      context.addIssue({
        code: "custom",
        message: "userOptions must be null for expert",
        path: ["userOptions"],
      });
    }
  });

/** 日本語名: ファシリテーターのグループチャット進行ターン。 */
export type FacilitatorTurn = z.infer<typeof FacilitatorTurnSchema>;

/**
 * グループチャット開始時のファシリテーターターン。
 *
 * 開始時は初回専門家コメントを踏まえ、確定済み専門家の1人へ最初の発言を
 * 依頼する。Gemini に渡す JSON Schema でもユーザー向け選択肢を禁止する。
 */
export const GroupChatStartTurnSchema = z.strictObject({
  message: nonEmptyString,
  requestedSpeaker: z.strictObject({
    speakerType: z.literal("expert"),
    speakerName: nonEmptyString,
    participantId: nonEmptyString,
  }),
  requestReason: nonEmptyString,
  question: nonEmptyString,
  userOptions: z.null(),
  memoUpdate: SessionMemoSchema.nullable(),
  contextSummaryUpdate: nonEmptyString.nullable(),
});

/** 日本語名: グループチャット開始時のファシリテーターターン。 */
export type GroupChatStartTurn = z.infer<typeof GroupChatStartTurnSchema>;

export const GroupChatStartRequestSchema = z
  .strictObject({
    consultation: nonEmptyString,
    currentPhase: z.literal("group_chat"),
    memo: SessionMemoSchema,
    confirmedExperts: z
      .array(GroupChatExpertSchema)
      .min(1)
      .max(maximumExpertRequestCount),
    initialExpertComments: z.array(ExpertCommentSchema),
  })
  .superRefine((request, context) => {
    if (
      request.confirmedExperts.length !== request.initialExpertComments.length
    ) {
      context.addIssue({
        code: "custom",
        message: "initialExpertComments must match confirmedExperts",
        path: ["initialExpertComments"],
      });
    }
    if (
      new Set(request.confirmedExperts.map((expert) => expert.participantId))
        .size !== request.confirmedExperts.length
    ) {
      context.addIssue({
        code: "custom",
        message: "confirmedExperts participantId must be unique",
        path: ["confirmedExperts"],
      });
    }
    for (const [index, expert] of request.confirmedExperts.entries()) {
      const comment = request.initialExpertComments[index];
      if (
        comment &&
        (comment.role_name !== expert.role_name ||
          comment.viewpoint !== expert.viewpoint)
      ) {
        context.addIssue({
          code: "custom",
          message: "initialExpertComments must match confirmedExperts in order",
          path: ["initialExpertComments", index],
        });
      }
    }
  });

/** 日本語名: グループチャット開始リクエスト。 */
export type GroupChatStartRequest = z.infer<typeof GroupChatStartRequestSchema>;

/** グループチャットで専門家が回答する API の入力契約。仕様対応: `docs/api/schemas.md#グループチャット`。 */
export const GroupChatExpertReplyRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: z.literal("group_chat"),
  memo: SessionMemoSchema,
  contextSummary: nonEmptyString,
  recentMessages: z
    .array(GroupChatMessageSchema)
    .max(recentGroupChatMessageLimit),
  expert: GroupChatExpertSchema,
  facilitatorQuestion: nonEmptyString,
});

export type GroupChatExpertReplyRequest = z.infer<
  typeof GroupChatExpertReplyRequestSchema
>;

/** 次のグループチャット進行ターンを求める API の入力契約。仕様対応: `docs/api/schemas.md#グループチャット`。 */
export const GroupChatNextRequestSchema = z
  .strictObject({
    consultation: nonEmptyString,
    currentPhase: z.literal("group_chat"),
    memo: SessionMemoSchema,
    contextSummary: nonEmptyString,
    recentMessages: z
      .array(GroupChatMessageSchema)
      .max(recentGroupChatMessageLimit),
    confirmedExperts: z
      .array(GroupChatExpertSchema)
      .min(1)
      .max(maximumExpertRequestCount),
    expertRepliesSinceUser: z.number().int().min(0).max(2),
  })
  .superRefine((request, context) => {
    if (
      new Set(request.confirmedExperts.map((expert) => expert.participantId))
        .size !== request.confirmedExperts.length
    ) {
      context.addIssue({
        code: "custom",
        message: "confirmedExperts participantId must be unique",
        path: ["confirmedExperts"],
      });
    }
  });

export type GroupChatNextRequest = z.infer<typeof GroupChatNextRequestSchema>;

export const SessionMemoRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: PhaseSchema,
  previousMemo: SessionMemoSchema.optional(),
  facilitatorResponse: z.lazy(() => FacilitatorResponseSchema).optional(),
  expertComments: z.array(ExpertCommentSchema).optional(),
  userAction: nonEmptyString.optional(),
});

export type SessionMemoRequest = z.infer<typeof SessionMemoRequestSchema>;

export const FacilitatorResponseSchema = z
  .strictObject({
    current_phase: PhaseSchema,
    current_phase_label: nonEmptyString,
    phase_goal: nonEmptyString,
    facilitator_message: nonEmptyString,
    expert_requests: z
      .array(ExpertRequestSchema)
      .max(maximumExpertRequestCount),
    user_question: UserQuestionSchema.nullable(),
    memo_updates: SessionMemoSchema,
    next_action: z.enum([
      "wait_user",
      "request_experts",
      "update_memo",
      "move_phase",
      "finish",
    ]),
  })
  .superRefine((response, context) => {
    if (response.user_question && response.expert_requests.length > 0) {
      context.addIssue({
        code: "custom",
        message: "expert_requests must be empty when user_question is present",
        path: ["expert_requests"],
      });
    }

    if (
      response.next_action === "request_experts" &&
      response.expert_requests.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "expert_requests must not be empty when next_action is request_experts",
        path: ["expert_requests"],
      });
    }
  });

export type FacilitatorResponse = z.infer<typeof FacilitatorResponseSchema>;

/**
 * 必須質問への回答後に専門家候補を返すファシリテーター応答。
 *
 * Gemini へ渡す JSON Schema でも追加質問との共存を禁止するため、
 * 共通応答 schema とは別に endpoint 固有のリテラル制約を定義する。
 */
export const FacilitatorRespondResponseSchema = z.strictObject({
  current_phase: z.literal("premise"),
  current_phase_label: nonEmptyString,
  phase_goal: nonEmptyString,
  facilitator_message: nonEmptyString,
  expert_requests: z
    .array(ExpertRequestSchema)
    .min(1)
    .max(maximumExpertRequestCount),
  user_question: z.null(),
  memo_updates: SessionMemoSchema,
  next_action: z.literal("request_experts"),
});

export type FacilitatorRespondResponse = z.infer<
  typeof FacilitatorRespondResponseSchema
>;

export const FinalMarkdownSchema = z
  .strictObject({
    markdown: nonEmptyString,
  })
  .superRefine((output, context) => {
    for (const heading of finalMarkdownRequiredHeadings) {
      if (!output.markdown.includes(heading)) {
        context.addIssue({
          code: "custom",
          message: `markdown must include ${heading}`,
          path: ["markdown"],
        });
      }
    }

    if (
      !finalMemoStatusLabels.some((label) => output.markdown.includes(label))
    ) {
      context.addIssue({
        code: "custom",
        message: "markdown must include a final memo status label",
        path: ["markdown"],
      });
    }
  });

export type FinalMarkdown = z.infer<typeof FinalMarkdownSchema>;

export const FinalMarkdownRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  memo: FinalSessionMemoSchema,
  expertComments: z.array(ExpertCommentSchema).optional(),
  contextSummary: nonEmptyString,
  recentMessages: z
    .array(GroupChatMessageSchema)
    .max(recentGroupChatMessageLimit),
});

export type FinalMarkdownRequest = z.infer<typeof FinalMarkdownRequestSchema>;
