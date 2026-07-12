import { z } from "zod";

export const PhaseSchema = z.enum([
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "direction",
  "final_memo"
]);

export type Phase = z.infer<typeof PhaseSchema>;

export const ConsultationRequestSchema = z.object({
  consultation: z.string().min(1),
  facts: z.string().optional(),
  values: z.string().optional(),
  concerns: z.string().optional(),
  expectedOutcome: z.string().optional()
});

export type ConsultationRequest = z.infer<typeof ConsultationRequestSchema>;

export const UserQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2),
  required: z.boolean()
});

export const SessionMemoSchema = z.object({
  theme: z.string(),
  status: z.enum([
    "in_progress",
    "tentative_conclusion",
    "pending_research",
    "pending_discussion",
    "action_plan"
  ]),
  facts: z.array(z.string()),
  values: z.array(z.string()),
  concerns: z.array(z.string()),
  options: z.array(z.string()),
  decision_axes: z.array(z.string()),
  expert_summaries: z.array(z.string()),
  conflicts: z.array(z.string()),
  open_questions: z.array(z.string()),
  next_actions: z.array(z.string())
});

export type SessionMemo = z.infer<typeof SessionMemoSchema>;

export const FacilitatorResponseSchema = z.object({
  current_phase: PhaseSchema,
  current_phase_label: z.string(),
  phase_goal: z.string(),
  facilitator_message: z.string(),
  expert_requests: z.array(
    z.object({
      role_name: z.string(),
      request: z.string()
    })
  ),
  user_question: UserQuestionSchema.nullable(),
  memo_updates: SessionMemoSchema,
  next_action: z.enum([
    "wait_user",
    "request_experts",
    "update_memo",
    "move_phase",
    "finish"
  ])
});

export type FacilitatorResponse = z.infer<typeof FacilitatorResponseSchema>;

