import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString);

export const PhaseSchema = z.enum([
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "direction",
  "final_memo"
]);

export type Phase = z.infer<typeof PhaseSchema>;

export const UserQuestionSchema = z.strictObject({
  question: nonEmptyString,
  options: nonEmptyStringArray.min(2),
  required: z.boolean()
}).superRefine((question, context) => {
  if (!question.options.includes("その他")) {
    context.addIssue({
      code: "custom",
      message: "user_question.options must include その他",
      path: ["options"]
    });
  }
});

export const SessionMemoStatusSchema = z.enum([
  "in_progress",
  "tentative_conclusion",
  "pending_decision",
  "pending_research",
  "pending_family_discussion",
  "action_plan"
]);

export type SessionMemoStatus = z.infer<typeof SessionMemoStatusSchema>;

export const FinalMemoStatusSchema = z.enum([
  "tentative_conclusion",
  "pending_decision",
  "pending_research",
  "pending_family_discussion",
  "action_plan"
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
  next_actions: nonEmptyStringArray
});

export type SessionMemo = z.infer<typeof SessionMemoSchema>;

export const ConsultationRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  facts: nonEmptyString.optional(),
  values: nonEmptyString.optional(),
  concerns: nonEmptyString.optional(),
  expectedOutcome: nonEmptyString.optional(),
  userQuestion: UserQuestionSchema.optional(),
  userQuestionAnswer: nonEmptyString.optional(),
  currentPhase: PhaseSchema.optional(),
  memo: SessionMemoSchema.optional()
});

export type ConsultationRequest = z.infer<typeof ConsultationRequestSchema>;

export const ExpertRequestSchema = z.strictObject({
  role_name: nonEmptyString,
  viewpoint: nonEmptyString,
  request: nonEmptyString
});

export type ExpertRequest = z.infer<typeof ExpertRequestSchema>;

export const ExpertCommentRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: PhaseSchema,
  memo: SessionMemoSchema.optional(),
  expert: ExpertRequestSchema
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
  needs_research: z.boolean()
});

export type ExpertComment = z.infer<typeof ExpertCommentSchema>;

export const FacilitatorResponseSchema = z.strictObject({
  current_phase: PhaseSchema,
  current_phase_label: nonEmptyString,
  phase_goal: nonEmptyString,
  facilitator_message: nonEmptyString,
  expert_requests: z.array(ExpertRequestSchema),
  user_question: UserQuestionSchema.nullable(),
  memo_updates: SessionMemoSchema,
  next_action: z.enum([
    "wait_user",
    "request_experts",
    "update_memo",
    "move_phase",
    "finish"
  ])
}).superRefine((response, context) => {
  if (response.next_action === "request_experts" && response.expert_requests.length === 0) {
    context.addIssue({
      code: "custom",
      message: "expert_requests must not be empty when next_action is request_experts",
      path: ["expert_requests"]
    });
  }
});

export type FacilitatorResponse = z.infer<typeof FacilitatorResponseSchema>;

export const FinalMarkdownSchema = z.strictObject({
  markdown: nonEmptyString
});

export type FinalMarkdown = z.infer<typeof FinalMarkdownSchema>;
