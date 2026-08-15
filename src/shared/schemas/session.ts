import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString);
const sessionMemoTheme = plainText(120);
const sessionMemoItem = plainText(80);
const sessionMemoArray = z.array(sessionMemoItem).max(3);
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

/** LLM が通常画面へ返す確認質問。入力用 `UserQuestionSchema` とは分離する。 */
const FacilitatorUserQuestionSchema = z
  .strictObject({
    question: plainText(150),
    options: z.array(plainText(150)).min(2),
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
  theme: sessionMemoTheme,
  status: SessionMemoStatusSchema,
  facts: sessionMemoArray,
  values: sessionMemoArray,
  concerns: sessionMemoArray,
  options: sessionMemoArray,
  decision_axes: sessionMemoArray,
  expert_summaries: sessionMemoArray,
  conflicts: sessionMemoArray,
  open_questions: sessionMemoArray,
  next_actions: sessionMemoArray,
});

export type SessionMemo = z.infer<typeof SessionMemoSchema>;

/** 通常画面のメモに許可する、Markdown構文を含まない短いプレーンテキスト。 */
function plainText(maximumLength: number) {
  return z
    .string()
    .transform((value) => value.replaceAll("<", "＜").replaceAll(">", "＞"))
    .pipe(nonEmptyString.max(maximumLength))
    .refine(
      (value) =>
        !/[\r\n]/.test(value) &&
        !/^[ \t]*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```)/.test(value) &&
        !containsInlineMarkdown(value),
      "Markdown syntax is not allowed in session memo text",
    );
}

/** 通常文を壊さず、表示対象では許可しないインラインMarkdownだけを検出する。 */
function containsInlineMarkdown(value: string) {
  return /\*\*[^*\r\n]+\*\*|__[^_\r\n]+__|`[^`\r\n]+`|\*[^*\s\r\n](?:[^*\r\n]*[^*\s\r\n])?\*|(?<![\p{L}\p{N}])_[^_\s\r\n](?:[^_\r\n]*[^_\s\r\n])?_(?![\p{L}\p{N}])|~~[^~\s\r\n](?:[^~\r\n]*[^~\s\r\n])?~~|!?\[[^\]\r\n]+\]\(\s*[^)\r\n]+\)/u.test(
    value,
  );
}

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

/** LLM が通常画面へ返す専門家依頼。入力用 `ExpertRequestSchema` とは分離する。 */
const FacilitatorExpertRequestSchema = z.strictObject({
  role_name: plainText(150),
  viewpoint: plainText(150),
  request: plainText(150),
});

export const ExpertCommentRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: PhaseSchema,
  memo: SessionMemoSchema.optional(),
  expert: ExpertRequestSchema,
});

export type ExpertCommentRequest = z.infer<typeof ExpertCommentRequestSchema>;

/** 初回専門家コメントで提示する、後続の検討対象となる具体案。 */
const ExpertProposalInputSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  content: nonEmptyString,
  benefits: nonEmptyStringArray.min(1),
  sacrifices: nonEmptyStringArray.min(1),
  conditions: nonEmptyStringArray.min(1),
});

export const ExpertProposalSchema = z.strictObject({
  id: nonEmptyString,
  name: plainText(120),
  content: plainText(120),
  benefits: z.array(plainText(80)).min(1),
  sacrifices: z.array(plainText(80)).min(1),
  conditions: z.array(plainText(80)).min(1),
});

/** 日本語名: 専門家提案。 */
export type ExpertProposal = z.infer<typeof ExpertProposalSchema>;

const ExpertCommentInputSchema = z.strictObject({
  role_name: nonEmptyString,
  viewpoint: nonEmptyString,
  summary: nonEmptyString,
  proposal: ExpertProposalInputSchema,
  key_point: nonEmptyString,
  concern: nonEmptyString,
  question_to_user: nonEmptyString,
  confidence: z.enum(["high", "medium", "low"]),
  needs_research: z.boolean(),
});

export const ExpertCommentSchema = z.strictObject({
  role_name: nonEmptyString,
  viewpoint: nonEmptyString,
  summary: plainText(300),
  proposal: ExpertProposalSchema,
  key_point: plainText(120),
  concern: plainText(120),
  question_to_user: plainText(120),
  confidence: z.enum(["high", "medium", "low"]),
  needs_research: z.boolean(),
});

export type ExpertComment = z.infer<typeof ExpertCommentSchema>;

/**
 * 初回専門家コメント後に、グループチャットの起点としてユーザーが選ぶ案。
 * 専門家ロールではなく `ExpertProposal.id` を参照する。
 */
export const DiscussionSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("deep_dive"),
    proposalId: nonEmptyString,
  }),
  z
    .strictObject({
      kind: z.literal("compare"),
      proposalIds: z.array(nonEmptyString).length(2),
    })
    .superRefine((selection, context) => {
      if (
        new Set(selection.proposalIds).size !== selection.proposalIds.length
      ) {
        context.addIssue({
          code: "custom",
          message: "comparison proposalIds must be unique",
          path: ["proposalIds"],
        });
      }
    }),
  z.strictObject({ kind: z.literal("defer") }),
]);

/** 日本語名: 意見交換の案選択。 */
export type DiscussionSelection = z.infer<typeof DiscussionSelectionSchema>;

/** 初回案と、その案を提示したグループチャット参加者の対応。 */
export const GroupChatProposalSchema = z.strictObject({
  participantId: nonEmptyString,
  roleName: nonEmptyString,
  proposal: ExpertProposalInputSchema,
});

/** 日本語名: 提案者を含むグループチャット用の具体案。 */
export type GroupChatProposal = z.infer<typeof GroupChatProposalSchema>;

/**
 * 開始後のグループチャットで維持する、案選択と具体案の完全な文脈。
 * `defer` でも全案を渡し、早期の案の脱落を防ぐ。
 */
export const GroupChatDiscussionContextSchema = z
  .strictObject({
    selection: DiscussionSelectionSchema,
    proposals: z
      .array(GroupChatProposalSchema)
      .min(1)
      .max(maximumExpertRequestCount),
  })
  .superRefine((context, issueContext) => {
    const proposalIds = context.proposals.map(
      (proposal) => proposal.proposal.id,
    );
    if (new Set(proposalIds).size !== proposalIds.length) {
      issueContext.addIssue({
        code: "custom",
        message: "discussionContext proposal IDs must be unique",
        path: ["proposals"],
      });
    }
    if (
      new Set(context.proposals.map((proposal) => proposal.participantId))
        .size !== context.proposals.length
    ) {
      issueContext.addIssue({
        code: "custom",
        message: "discussionContext participant IDs must be unique",
        path: ["proposals"],
      });
    }
    const selectedProposalIds =
      context.selection.kind === "deep_dive"
        ? [context.selection.proposalId]
        : context.selection.kind === "compare"
          ? context.selection.proposalIds
          : [];
    if (selectedProposalIds.some((id) => !proposalIds.includes(id))) {
      issueContext.addIssue({
        code: "custom",
        message: "discussionContext selection must reference proposals",
        path: ["selection"],
      });
    }
  });

/** 日本語名: グループチャットの案検討文脈。 */
export type GroupChatDiscussionContext = z.infer<
  typeof GroupChatDiscussionContextSchema
>;

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
const GroupChatMessageInputSchema = z.strictObject({
  id: nonEmptyString,
  speakerType: z.enum(["facilitator", "expert", "user"]),
  speakerName: nonEmptyString,
  participantId: nonEmptyString,
  content: nonEmptyString,
  createdAt: nonEmptyString,
});

export const GroupChatMessageSchema = GroupChatMessageInputSchema;

/** 専門家LLMが返す、通常画面向けのグループチャット発言。 */
export const ExpertGroupChatMessageSchema = GroupChatMessageInputSchema.extend({
  speakerType: z.literal("expert"),
  content: plainText(200),
});

/** 日本語名: グループチャット発言。 */
export type GroupChatMessage = z.infer<typeof GroupChatMessageSchema>;

/** 日本語名: 専門家LLMのグループチャット発言。 */
export type ExpertGroupChatMessage = z.infer<
  typeof ExpertGroupChatMessageSchema
>;

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
    message: plainText(200),
    requestedSpeaker: RequestedSpeakerSchema,
    requestReason: plainText(200),
    question: plainText(200),
    userOptions: z.array(plainText(200)).nullable(),
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
  message: plainText(200),
  requestedSpeaker: z.strictObject({
    speakerType: z.literal("expert"),
    speakerName: nonEmptyString,
    participantId: nonEmptyString,
  }),
  requestReason: plainText(200),
  question: plainText(200),
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
    initialExpertComments: z.array(ExpertCommentInputSchema),
    discussionSelection: DiscussionSelectionSchema,
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
    const proposalIds = request.initialExpertComments.map(
      (comment) => comment.proposal.id,
    );
    if (new Set(proposalIds).size !== proposalIds.length) {
      context.addIssue({
        code: "custom",
        message: "initialExpertComments proposal IDs must be unique",
        path: ["initialExpertComments"],
      });
    }
    const selectedProposalIds =
      request.discussionSelection.kind === "deep_dive"
        ? [request.discussionSelection.proposalId]
        : request.discussionSelection.kind === "compare"
          ? request.discussionSelection.proposalIds
          : [];
    if (selectedProposalIds.some((id) => !proposalIds.includes(id))) {
      context.addIssue({
        code: "custom",
        message: "discussionSelection must reference initial proposals",
        path: ["discussionSelection"],
      });
    }
  });

/** 日本語名: グループチャット開始リクエスト。 */
export type GroupChatStartRequest = z.infer<typeof GroupChatStartRequestSchema>;

/** グループチャットで専門家が回答する API の入力契約。仕様対応: `docs/api/schemas.md#グループチャット`。 */
export const GroupChatExpertReplyRequestSchema = z
  .strictObject({
    consultation: nonEmptyString,
    currentPhase: z.literal("group_chat"),
    memo: SessionMemoSchema,
    contextSummary: nonEmptyString,
    recentMessages: z
      .array(GroupChatMessageInputSchema)
      .max(recentGroupChatMessageLimit),
    expert: GroupChatExpertSchema,
    facilitatorQuestion: nonEmptyString,
    discussionContext: GroupChatDiscussionContextSchema,
  })
  .superRefine((request, context) => {
    if (
      !request.discussionContext.proposals.some(
        (proposal) =>
          proposal.participantId === request.expert.participantId &&
          proposal.roleName === request.expert.role_name,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "discussionContext must include the requested expert proposal",
        path: ["discussionContext", "proposals"],
      });
    }
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
      .array(GroupChatMessageInputSchema)
      .max(recentGroupChatMessageLimit),
    confirmedExperts: z
      .array(GroupChatExpertSchema)
      .min(1)
      .max(maximumExpertRequestCount),
    expertRepliesSinceUser: z.number().int().min(0).max(2),
    discussionContext: GroupChatDiscussionContextSchema,
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
    if (
      request.discussionContext.proposals.length !==
        request.confirmedExperts.length ||
      request.discussionContext.proposals.some(
        (proposal, index) =>
          proposal.participantId !==
            request.confirmedExperts[index]?.participantId ||
          proposal.roleName !== request.confirmedExperts[index]?.role_name,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "discussionContext proposals must match confirmedExperts in order",
        path: ["discussionContext", "proposals"],
      });
    }
  });

export type GroupChatNextRequest = z.infer<typeof GroupChatNextRequestSchema>;

export const SessionMemoRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  currentPhase: PhaseSchema,
  previousMemo: SessionMemoSchema.optional(),
  facilitatorResponse: z.lazy(() => FacilitatorResponseInputSchema).optional(),
  expertComments: z.array(ExpertCommentInputSchema).optional(),
  userAction: nonEmptyString.optional(),
});

export type SessionMemoRequest = z.infer<typeof SessionMemoRequestSchema>;

const FacilitatorResponseInputSchema = z
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

export const FacilitatorResponseSchema = z
  .strictObject({
    current_phase: PhaseSchema,
    current_phase_label: plainText(150),
    phase_goal: plainText(150),
    facilitator_message: plainText(150),
    expert_requests: z
      .array(FacilitatorExpertRequestSchema)
      .max(maximumExpertRequestCount),
    user_question: FacilitatorUserQuestionSchema.nullable(),
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
  current_phase_label: plainText(150),
  phase_goal: plainText(150),
  facilitator_message: plainText(150),
  expert_requests: z
    .array(FacilitatorExpertRequestSchema)
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
    markdown: nonEmptyString.max(3000),
  })
  .superRefine((output, context) => {
    if (!usesAllowedFinalMarkdownBlocks(output.markdown)) {
      context.addIssue({
        code: "custom",
        message:
          "markdown must use only headings, paragraphs, and unordered lists",
        path: ["markdown"],
      });
    }

    if (!usesExactFinalMarkdownHeadings(output.markdown)) {
      context.addIssue({
        code: "custom",
        message:
          "markdown must contain exactly the required H1/H2 headings in order",
        path: ["markdown"],
      });
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

/** 終了メモで許可するMarkdownブロックだけを判定する。 */
function usesAllowedFinalMarkdownBlocks(markdown: string) {
  if (containsForbiddenFinalMarkdownHtml(markdown)) return false;

  return markdown.split(/\r?\n/).every((line) => {
    if (line.trim().length === 0) return true;
    if (/^(?: {4}|\t)/.test(line)) return false;
    if (getFinalMarkdownHeading(line)) return true;
    if (/^[ \t]*(?:`{3,}|~{3,}|#{3,}|>|\+\s|\d+[.)]\s)/.test(line)) {
      return false;
    }
    if (/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) {
      return false;
    }
    if (/^[ \t]*(?:=+|-+)[ \t]*$/.test(line)) return false;
    if (/^[ \t]*\|/.test(line)) return false;

    return true;
  });
}

/** HTML として解釈され得る要素、コメント、宣言、CDATA、処理命令を終了メモから除外する。 */
function containsForbiddenFinalMarkdownHtml(markdown: string) {
  return /<\/?[a-z][^>]*>|<!--(?:[\s\S]*?-->|[\s\S]*$)|<![a-z][^>]*>|<!\[CDATA\[(?:[\s\S]*?\]\]>|[\s\S]*$)|<\?(?:[\s\S]*?\?>|[\s\S]*$)/i.test(
    markdown,
  );
}

/** 許可済みの先頭0〜3空白付きH1/H2を、必須見出し照合用に正規化する。 */
export function getFinalMarkdownHeading(line: string) {
  const match = line.match(/^ {0,3}(#{1,2})[ \t]+(.+?)[ \t]*$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

/** 認識済みのH1/H2が、必須見出しと仕様順・件数とも完全一致するかを判定する。 */
function usesExactFinalMarkdownHeadings(markdown: string) {
  const headings = markdown
    .split(/\r?\n/)
    .map(getFinalMarkdownHeading)
    .filter((heading): heading is string => heading !== null);

  return (
    headings.length === finalMarkdownRequiredHeadings.length &&
    headings.every(
      (heading, index) => heading === finalMarkdownRequiredHeadings[index],
    )
  );
}

export type FinalMarkdown = z.infer<typeof FinalMarkdownSchema>;

export const FinalMarkdownRequestSchema = z.strictObject({
  consultation: nonEmptyString,
  memo: FinalSessionMemoSchema,
  expertComments: z.array(ExpertCommentInputSchema).optional(),
  contextSummary: nonEmptyString,
  recentMessages: z
    .array(GroupChatMessageInputSchema)
    .max(recentGroupChatMessageLimit),
});

export type FinalMarkdownRequest = z.infer<typeof FinalMarkdownRequestSchema>;
