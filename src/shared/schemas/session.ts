import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString);
/**
 * M3 で選択・確定できる専門家ロール数の上限。
 *
 * 仕様対応: `docs/tasks/milestone-3.md#専門家候補の表示と編集`。
 */
export const maximumExpertRequestCount = 5;
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
  "direction",
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
 * M3 のファシリテーター整理 API の入力契約。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/deliberation`。
 */
export const FacilitatorDeliberationRequestSchema = z
  .strictObject({
    consultation: nonEmptyString,
    currentPhase: z.literal("deliberation"),
    memo: SessionMemoSchema,
    confirmedExperts: z
      .array(ExpertRequestSchema)
      .min(1)
      .max(maximumExpertRequestCount),
    expertComments: z.array(ExpertCommentSchema),
  })
  .superRefine((request, context) => {
    if (request.expertComments.length !== request.confirmedExperts.length) {
      context.addIssue({
        code: "custom",
        message: "expertComments must have the same length as confirmedExperts",
        path: ["expertComments"],
      });
      return;
    }

    for (const [index, expert] of request.confirmedExperts.entries()) {
      const comment = request.expertComments[index];
      if (
        comment.role_name !== expert.role_name ||
        comment.viewpoint !== expert.viewpoint
      ) {
        context.addIssue({
          code: "custom",
          message:
            "expertComments must match confirmedExperts by role_name and viewpoint at each index",
          path: ["expertComments", index],
        });
      }
    }
  });

/** 日本語名: ファシリテーター整理リクエスト。 */
export type FacilitatorDeliberationRequest = z.infer<
  typeof FacilitatorDeliberationRequestSchema
>;

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
});

export type FinalMarkdownRequest = z.infer<typeof FinalMarkdownRequestSchema>;
