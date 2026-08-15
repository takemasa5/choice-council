import type {
  ConsultationRequest,
  ConsultationStartRequest,
  DiscussionSelection,
  ExpertComment,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorTurn,
  FinalMemoStatus,
  GroupChatMessage,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import {
  ConsultationRequestSchema,
  DiscussionSelectionSchema,
  ExpertCommentSchema,
  ExpertGroupChatMessageSchema,
  ExpertRequestSchema,
  FacilitatorResponseSchema,
  FacilitatorTurnSchema,
  FinalMemoStatusSchema,
  FinalMarkdownSchema,
  GroupChatMessageSchema,
  maximumExpertRequestCount,
  getFinalMarkdownHeading,
  SessionMemoSchema,
} from "../shared/schemas/session";
import {
  clearResponseHistory,
  createResponseForPhase,
  createResponseHistoryForNewConsultation,
  getReturnablePhases,
  keepResponsesThroughPhase,
  phaseOrder,
  type ResponseHistory,
} from "./phase-history";
import type { ExpertDraft } from "./hooks/use-expert-selection-phase";

export type SessionState = {
  startedConsultation: string;
  response: FacilitatorResponse | null;
  responseHistory: ResponseHistory;
  currentPhase: Phase;
};

export type StoredSession = {
  request: ConsultationRequest;
  startedConsultation?: string;
  response: FacilitatorResponse | null;
  responseHistory?: ResponseHistory;
  currentPhase?: unknown;
  expertComments?: ExpertComment[];
  expertDrafts?: ExpertDraft[];
  expertDraftProvenanceKey?: string;
  initialExpertRequests?: ExpertRequest[];
  confirmedExperts?: ExpertRequest[];
  groupChatMessages?: GroupChatMessage[];
  groupChatTurn?: FacilitatorTurn;
  groupChatContextSummary?: string;
  groupChatExpertRepliesSinceUser?: number;
  groupChatNextTurnRetryPending?: boolean;
  discussionSelection?: DiscussionSelection;
  selectedProposalIds?: string[];
  finalMarkdown?: string;
};

/** 保存データから安全に利用できる初回案と選択の状態。 */
export type RestoredProposalState = {
  expertComments: ExpertComment[];
  discussionSelection: DiscussionSelection | null;
  selectedProposalIds: string[];
  isValid: boolean;
};

/** 保存セッションの復元結果。無効な保存値と初期状態を混同しない。 */
export type StoredSessionRestoration = SessionState &
  (
    | {
        isValid: true;
        session: StoredSession;
        proposalState: RestoredProposalState;
      }
    | { isValid: false }
  );

export function createInitialSessionState(): SessionState {
  return {
    startedConsultation: "",
    response: null,
    responseHistory: clearResponseHistory(),
    currentPhase: "consultation_input",
  };
}

/**
 * 保存値は現行schemaと状態機械を完全に満たす場合だけ復元する。
 * 古い形式や途中状態を局所的に修復しないことで、表示・API入力の契約を保つ。
 */
export function restoreStoredSessionState(
  parsed: unknown,
): StoredSessionRestoration {
  const session = parseStoredSession(parsed);
  if (!session) return { ...createInitialSessionState(), isValid: false };

  const proposalState = getRestoredProposalState(session);
  if (!isStoredSessionStateMachineConsistent(session, proposalState)) {
    return { ...createInitialSessionState(), isValid: false };
  }

  return {
    startedConsultation:
      session.startedConsultation ?? session.request.consultation,
    response: session.response,
    responseHistory: session.responseHistory ?? {},
    currentPhase: session.currentPhase as Phase,
    isValid: true,
    session,
    proposalState,
  };
}

function parseStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value) || !hasOnlyStoredSessionKeys(value)) return null;
  if (!isExactSchemaValue(value.request, ConsultationRequestSchema))
    return null;
  if (!isPhase(value.currentPhase)) return null;
  if (!isStoredResponse(value.response)) return null;
  if (!isStoredResponseHistory(value.responseHistory)) return null;
  if (!isOptionalString(value.startedConsultation)) return null;
  if (!isArrayOf(value.expertComments, ExpertCommentSchema)) return null;
  if (!isStoredExpertDrafts(value.expertDrafts)) return null;
  if (!isOptionalExpertDraftProvenance(value.expertDraftProvenanceKey))
    return null;
  if (!isArrayOf(value.initialExpertRequests, ExpertRequestSchema)) return null;
  if (!isArrayOf(value.confirmedExperts, ExpertRequestSchema)) return null;
  if (!isArrayOf(value.groupChatMessages, GroupChatMessageSchema)) return null;
  if (!hasUniqueGroupChatMessageIds(value.groupChatMessages)) return null;
  if (!isOptionalSchemaValue(value.groupChatTurn, FacilitatorTurnSchema)) {
    return null;
  }
  if (!isOptionalNonEmptyString(value.groupChatContextSummary)) return null;
  if (!isNonNegativeInteger(value.groupChatExpertRepliesSinceUser)) return null;
  if (
    value.groupChatNextTurnRetryPending !== undefined &&
    typeof value.groupChatNextTurnRetryPending !== "boolean"
  ) {
    return null;
  }
  if (
    value.discussionSelection !== undefined &&
    !isExactSchemaValue(value.discussionSelection, DiscussionSelectionSchema)
  ) {
    return null;
  }
  if (!isNonEmptyStringArray(value.selectedProposalIds)) return null;
  if (
    value.finalMarkdown !== undefined &&
    typeof value.finalMarkdown !== "string"
  ) {
    return null;
  }

  return value as StoredSession;
}

function hasOnlyStoredSessionKeys(value: Record<string, unknown>) {
  const storedSessionKeys = new Set<string>([
    "request",
    "startedConsultation",
    "response",
    "responseHistory",
    "currentPhase",
    "expertComments",
    "expertDrafts",
    "expertDraftProvenanceKey",
    "initialExpertRequests",
    "confirmedExperts",
    "groupChatMessages",
    "groupChatTurn",
    "groupChatContextSummary",
    "groupChatExpertRepliesSinceUser",
    "groupChatNextTurnRetryPending",
    "discussionSelection",
    "selectedProposalIds",
    "finalMarkdown",
  ]);

  return Object.keys(value).every((key) => storedSessionKeys.has(key));
}

function isStoredResponse(value: unknown) {
  return value === null || isExactSchemaValue(value, FacilitatorResponseSchema);
}

function isStoredResponseHistory(value: unknown): value is ResponseHistory {
  if (!isRecord(value)) return false;

  return Object.entries(value).every(
    ([phase, response]) =>
      isPhase(phase) &&
      isExactSchemaValue(response, FacilitatorResponseSchema) &&
      (response as FacilitatorResponse).current_phase === phase,
  );
}

function isArrayOf(
  value: unknown,
  schema: {
    safeParse: (input: unknown) => { success: boolean; data?: unknown };
  },
) {
  return (
    Array.isArray(value) &&
    value.every((item) => isExactSchemaValue(item, schema))
  );
}

function hasUniqueGroupChatMessageIds(messages: unknown) {
  if (!Array.isArray(messages)) return false;

  const messageIds = new Set<string>();

  return messages.every((message) => {
    if (!isRecord(message) || typeof message.id !== "string") return false;
    if (messageIds.has(message.id)) return false;

    messageIds.add(message.id);
    return true;
  });
}

function isStoredExpertDrafts(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every(
      (draft) =>
        isRecord(draft) &&
        typeof draft.role_name === "string" &&
        typeof draft.viewpoint === "string" &&
        typeof draft.request === "string" &&
        typeof draft.draftId === "string" &&
        draft.draftId.trim().length > 0 &&
        Object.keys(draft).length === 4,
    )
  );
}

function isOptionalExpertDraftProvenance(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;

  try {
    const candidates: unknown = JSON.parse(value);
    return isArrayOf(candidates, ExpertRequestSchema);
  } catch {
    return false;
  }
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalSchemaValue(
  value: unknown,
  schema: {
    safeParse: (input: unknown) => { success: boolean; data?: unknown };
  },
) {
  return value === undefined || isExactSchemaValue(value, schema);
}

function isOptionalNonEmptyString(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "string" && value.trim().length > 0)
  );
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyStringArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isPhase(value: unknown): value is Phase {
  return [
    "consultation_input",
    "premise",
    "expert_selection",
    "deliberation",
    "group_chat",
    "final_memo",
  ].includes(value as Phase);
}

function isExactSchemaValue(
  value: unknown,
  schema: {
    safeParse: (input: unknown) => { success: boolean; data?: unknown };
  },
) {
  const parsed = schema.safeParse(value);
  return parsed.success && stableJson(parsed.data) === stableJson(value);
}

function stableJson(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * 互換確認用の正規化ヘルパー。
 * 保存セッションの復元処理では使用せず、不整合な保存値は `restoreStoredSessionState`
 * で全体を破棄する。
 */
export function normalizeStoredSession(session: StoredSession): StoredSession {
  const confirmedExperts = normalizeStoredConfirmedExpertRequests(
    session.confirmedExperts,
    session.initialExpertRequests,
    isPremiseResponse(session.response)
      ? session.response.expert_requests
      : undefined,
    session.expertComments,
  );
  const expertDrafts = normalizeStoredExpertDrafts(
    session.expertDrafts,
    session.expertDraftProvenanceKey,
  );
  const response = normalizeStoredFacilitatorResponse(session.response);
  const responseHistory = session.responseHistory
    ? normalizeResponseHistory(session.responseHistory)
    : undefined;

  return {
    ...session,
    request: session.request.memo
      ? { ...session.request, memo: normalizeSessionMemo(session.request.memo) }
      : session.request,
    response,
    responseHistory,
    confirmedExperts,
    initialExpertRequests: normalizeStoredExpertRequests(
      session.initialExpertRequests,
    ),
    expertDrafts,
    expertDraftProvenanceKey:
      expertDrafts === undefined
        ? undefined
        : normalizeStoredExpertDraftProvenanceKey(
            session.expertDraftProvenanceKey,
          ),
    expertComments: normalizeStoredExpertComments(session.expertComments),
    groupChatMessages: normalizeStoredGroupChatMessages(
      session.groupChatMessages,
    ),
    groupChatTurn: normalizeStoredFacilitatorTurn(session.groupChatTurn),
    finalMarkdown: normalizeStoredFinalMarkdown(
      session.finalMarkdown,
      getStoredFinalMemoStatus(response, responseHistory),
    ),
  };
}

function isPremiseResponse(
  response: unknown,
): response is { current_phase: "premise"; expert_requests: unknown } {
  return isRecord(response) && response.current_phase === "premise";
}

/** 保存済み終了メモは現行の表示契約を満たす場合だけ復元する。 */
function normalizeStoredFinalMarkdown(
  value: unknown,
  memoStatus: FinalMemoStatus | undefined,
) {
  const parsedMarkdown = FinalMarkdownSchema.safeParse({ markdown: value });

  if (!parsedMarkdown.success || !memoStatus) return undefined;

  return isFinalMarkdownStatusConsistent(
    parsedMarkdown.data.markdown,
    memoStatus,
  )
    ? parsedMarkdown.data.markdown
    : undefined;
}

/** 保存済み終了メモの状態は、終了メモ応答を優先して復元する。 */
function getStoredFinalMemoStatus(
  response: FacilitatorResponse | null,
  responseHistory: ResponseHistory | undefined,
) {
  const memo =
    response?.current_phase === "final_memo"
      ? response.memo_updates
      : responseHistory?.final_memo?.memo_updates;
  const parsedStatus = FinalMemoStatusSchema.safeParse(memo?.status);

  return parsedStatus.success ? parsedStatus.data : undefined;
}

const finalMemoStatusLabels: Record<FinalMemoStatus, string> = {
  tentative_conclusion: "暫定結論",
  pending_decision: "判断保留",
  pending_research: "追加調査待ち",
  pending_family_discussion: "家族・関係者相談待ち",
  action_plan: "実行計画",
};

/** API応答と同じ終了状態契約を、保存済みMarkdownの復元時にも適用する。 */
function isFinalMarkdownStatusConsistent(
  markdown: string,
  memoStatus: FinalMemoStatus,
) {
  const statusSection = getMarkdownSection(markdown, "## 現時点の状態");
  const expectedStatusLabel = finalMemoStatusLabels[memoStatus];

  return (
    hasStandaloneStatusLabel(statusSection, expectedStatusLabel) &&
    !Object.values(finalMemoStatusLabels).some(
      (statusLabel) =>
        statusLabel !== expectedStatusLabel &&
        hasStandaloneStatusLabel(statusSection, statusLabel),
    )
  );
}

/** 指定見出しから次の見出しまでを、終了状態の検証対象として取り出す。 */
function getMarkdownSection(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => getFinalMarkdownHeading(line) === heading,
  );
  if (startIndex === -1) return "";

  const sectionLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (getFinalMarkdownHeading(line) !== null) break;
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

/** 選択済み状態が、説明文ではなく独立した段落または箇条書き項目かを判定する。 */
function hasStandaloneStatusLabel(section: string, statusLabel: string) {
  const lines = section.split(/\r?\n/);

  return lines.some((line, index) => {
    const listItem = getUnorderedListItem(line);
    if (listItem !== null) return listItem === statusLabel;

    return (
      line.trim() === statusLabel && isStandaloneParagraphLine(lines, index)
    );
  });
}

/** 順不同リストを段落を区切るブロックとして扱う。 */
function isStandaloneParagraphLine(lines: string[], index: number) {
  const previousLine = lines[index - 1];
  const nextLine = lines[index + 1];

  return (
    (previousLine === undefined ||
      previousLine.trim() === "" ||
      getUnorderedListItem(previousLine) !== null) &&
    (nextLine === undefined ||
      nextLine.trim() === "" ||
      getUnorderedListItem(nextLine) !== null)
  );
}

/** 許可済み順不同リスト項目の表示テキストを取得する。 */
function getUnorderedListItem(line: string): string | null {
  const match = line.match(/^ {0,3}(?:-|\*)[ \t]+(.+?)\s*$/);
  return match ? match[1] : null;
}

/** 保存済みファシリテーター応答を、現行表示schemaに適合する場合だけ復元する。 */
function normalizeStoredFacilitatorResponse(
  response: unknown,
): FacilitatorResponse | null {
  if (response === null) return null;

  const currentResponse = FacilitatorResponseSchema.safeParse(response);
  if (currentResponse.success) return currentResponse.data;

  const record = isRecord(response) ? response : {};
  const userQuestion = normalizeStoredFacilitatorUserQuestion(
    record.user_question,
  );
  const expertRequests = userQuestion
    ? []
    : normalizeStoredFacilitatorExpertRequests(record.expert_requests);
  const normalizedResponse = {
    current_phase: record.current_phase,
    current_phase_label: normalizeFacilitatorText(record.current_phase_label),
    phase_goal: normalizeFacilitatorText(record.phase_goal),
    facilitator_message: normalizeFacilitatorText(record.facilitator_message),
    expert_requests: expertRequests,
    user_question: userQuestion,
    memo_updates: normalizeSessionMemo(record.memo_updates),
    next_action: record.next_action,
  };
  const parsedResponse =
    FacilitatorResponseSchema.safeParse(normalizedResponse);

  return parsedResponse.success ? parsedResponse.data : null;
}

/** 保存済み履歴中のすべてのメモを現行制約へ正規化する。 */
function normalizeResponseHistory(responseHistory: ResponseHistory) {
  return Object.fromEntries(
    Object.entries(responseHistory).flatMap(([phase, response]) => {
      const normalizedResponse = normalizeStoredFacilitatorResponse(response);
      return normalizedResponse ? [[phase, normalizedResponse]] : [];
    }),
  ) as ResponseHistory;
}

/** 現行のSessionMemo制約へ、旧形式のメモ本文だけを安全に収める。 */
function normalizeSessionMemo(memo: unknown): SessionMemo {
  const record = isRecord(memo) ? memo : {};

  return {
    theme: normalizeMemoText(record.theme, 120) || "未設定",
    status: normalizeMemoStatus(record.status),
    facts: normalizeMemoItems(record.facts),
    values: normalizeMemoItems(record.values),
    concerns: normalizeMemoItems(record.concerns),
    options: normalizeMemoItems(record.options),
    decision_axes: normalizeMemoItems(record.decision_axes),
    expert_summaries: normalizeMemoItems(record.expert_summaries),
    conflicts: normalizeMemoItems(record.conflicts),
    open_questions: normalizeMemoItems(record.open_questions),
    next_actions: normalizeMemoItems(record.next_actions),
  };
}

/** 旧メモの表示文字列をトリム・平文化して現行の文字数上限に収める。 */
function normalizeMemoText(value: unknown, maximumLength: number) {
  const normalized = normalizeLegacyPlainText(value, maximumLength);

  return isValidNormalizedMemoText(normalized, maximumLength) ? normalized : "";
}

/** 旧保存値の表示テキストから、現行出力で禁止するMarkdownを取り除く。 */
function normalizeLegacyPlainText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return "";

  let normalized = removeLegacyFencedCodeBlocks(value)
    .replace(/[\r\n]+/g, " ")
    .trim();
  let withoutLeadingMarker = normalized.replace(
    /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|`{3,}[ \t]*|>[ \t]?)/,
    "",
  );

  while (withoutLeadingMarker !== normalized) {
    normalized = withoutLeadingMarker.trimStart();
    withoutLeadingMarker = normalized.replace(
      /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|`{3,}[ \t]*|>[ \t]?)/,
      "",
    );
  }

  return normalized
    .replace(/!?\[([^\]\r\n]+)\]\(\s*[^)\r\n]+\)/g, "$1")
    .replace(
      /\*\*([^*\r\n]+)\*\*|__([^_\r\n]+)__|\*([^*\r\n]+)\*|(?<![\p{L}\p{N}])_([^_\r\n]+)_(?![\p{L}\p{N}])/gu,
      (_match, bold, underline, emphasis, underscore) =>
        bold ?? underline ?? emphasis ?? underscore,
    )
    .replace(/`([^`\r\n]+)`/g, "$1")
    .replace(/~~([^~\r\n]+)~~/g, "$1")
    .trim()
    .slice(0, maximumLength);
}

/** 旧保存値のfenced code blockを、言語指定と開閉フェンスなしの本文へ戻す。 */
function removeLegacyFencedCodeBlocks(value: string) {
  return value
    .replace(
      /^[ \t]*(?:(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?))*```[^\r\n]*\r?\n(?:([\s\S]*?)\r?\n)?[ \t]*```[ \t]*(?:\r?\n|$)/gm,
      "$1",
    )
    .replace(/^[ \t]*```[ \t]*(?:\r?\n|$)/gm, "");
}

/** ファシリテーターの通常画面文言を、現行の150字プレーンテキストへ収める。 */
function normalizeFacilitatorText(value: unknown) {
  const normalized = normalizeLegacyPlainText(value, 150);
  if (!normalized) return "";

  const candidate = {
    current_phase: "premise",
    current_phase_label: normalized,
    phase_goal: normalized,
    facilitator_message: normalized,
    expert_requests: [],
    user_question: null,
    memo_updates: normalizeSessionMemo({}),
    next_action: "wait_user",
  };

  const parsedResponse = FacilitatorResponseSchema.safeParse(candidate);

  return parsedResponse.success ? parsedResponse.data.current_phase_label : "";
}

/** 旧保存済みの専門家候補を、現行の通常画面制約へ収める。 */
function normalizeStoredFacilitatorExpertRequests(value: unknown) {
  return normalizeStoredExpertRequests(value) ?? [];
}

/** 保存済みのLLM由来専門家候補を、通常画面の現行形式へ収める。 */
function normalizeStoredExpertRequests(
  value: unknown,
): ExpertRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalizedExperts = value
    .slice(0, maximumExpertRequestCount)
    .map((expert) => {
      const record = isRecord(expert) ? expert : {};
      return {
        role_name: normalizeFacilitatorText(record.role_name),
        viewpoint: normalizeFacilitatorText(record.viewpoint),
        request: normalizeFacilitatorText(record.request),
      };
    })
    .filter(
      (expert) =>
        expert.role_name.length > 0 &&
        expert.viewpoint.length > 0 &&
        expert.request.length > 0,
    );

  return value.length > 0 && normalizedExperts.length === 0
    ? undefined
    : normalizedExperts;
}

/**
 * 確定済み候補はユーザーが編集した入力として、そのまま後続APIへ渡せる形で復元する。
 * 現行の入力schemaを満たさない旧形式だけは、LLM候補と同じ互換正規化を行う。
 */
function normalizeStoredConfirmedExpertRequests(
  value: unknown,
  initialCandidates: unknown,
  responseCandidates: unknown,
  expertComments: unknown,
): ExpertRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const currentExperts = ExpertRequestSchema.array().safeParse(
    value.slice(0, maximumExpertRequestCount),
  );
  if (
    currentExperts.success &&
    confirmedExpertsContainUserInput(
      currentExperts.data,
      initialCandidates,
      responseCandidates,
      expertComments,
    )
  ) {
    return currentExperts.data;
  }

  return normalizeStoredExpertRequests(value);
}

/** 確定候補がLLM候補と異なるか、生成済みコメントが原文を参照していればユーザー入力として保持する。 */
function confirmedExpertsContainUserInput(
  confirmedExperts: ExpertRequest[],
  initialCandidates: unknown,
  responseCandidates: unknown,
  expertComments: unknown,
) {
  if (confirmedExpertsMatchCommentHeaders(confirmedExperts, expertComments)) {
    return true;
  }

  return ![initialCandidates, responseCandidates].some((candidates) =>
    expertRequestsMatch(confirmedExperts, candidates),
  );
}

function confirmedExpertsMatchCommentHeaders(
  confirmedExperts: ExpertRequest[],
  expertComments: unknown,
) {
  return (
    Array.isArray(expertComments) &&
    confirmedExperts.length === expertComments.length &&
    confirmedExperts.every((expert, index) => {
      const comment = expertComments[index];
      return (
        isRecord(comment) &&
        expert.role_name === comment.role_name &&
        expert.viewpoint === comment.viewpoint
      );
    })
  );
}

function expertRequestsMatch(experts: ExpertRequest[], candidates: unknown) {
  const parsedCandidates = ExpertRequestSchema.array().safeParse(candidates);
  return (
    parsedCandidates.success &&
    experts.length === parsedCandidates.data.length &&
    experts.every((expert, index) => {
      const candidate = parsedCandidates.data[index];
      return (
        candidate !== undefined &&
        expert.role_name === candidate.role_name &&
        expert.viewpoint === candidate.viewpoint &&
        expert.request === candidate.request
      );
    })
  );
}

/**
 * 編集済み下書きは入力内容を保持する。復元元候補と一致する未編集下書きだけを
 * LLM由来候補として通常画面向けに正規化する。
 */
function normalizeStoredExpertDrafts(
  value: unknown,
  provenanceKey: unknown,
): ExpertDraft[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const provenance = parseExpertDraftProvenance(provenanceKey);

  return value.slice(0, maximumExpertRequestCount).flatMap((draft, index) => {
    if (!isRecord(draft)) return [];

    const isUneditedLlmDraft = draftMatchesProvenance(
      draft,
      provenance?.[index],
    );

    return [
      {
        role_name: normalizeStoredExpertDraftText(
          draft.role_name,
          isUneditedLlmDraft,
        ),
        viewpoint: normalizeStoredExpertDraftText(
          draft.viewpoint,
          isUneditedLlmDraft,
        ),
        request: normalizeStoredExpertDraftText(
          draft.request,
          isUneditedLlmDraft,
        ),
        draftId:
          typeof draft.draftId === "string" && draft.draftId.trim()
            ? draft.draftId
            : `restored-expert-draft-${index + 1}`,
      },
    ];
  });
}

function normalizeStoredExpertDraftText(value: unknown, isLlmDraft: boolean) {
  if (isLlmDraft) return normalizeFacilitatorText(value);
  return typeof value === "string" ? value : "";
}

/** 復元元候補キーを、下書きとの位置対応を保ったまま読み出す。 */
function parseExpertDraftProvenance(provenanceKey: unknown) {
  if (typeof provenanceKey !== "string") return undefined;

  try {
    const provenance = JSON.parse(provenanceKey);
    return Array.isArray(provenance) ? provenance : undefined;
  } catch {
    return undefined;
  }
}

/** 同じ位置の復元元候補と一致するときだけ、下書きを未編集のLLM候補として扱う。 */
function draftMatchesProvenance(
  draft: Record<string, unknown>,
  provenance: unknown,
) {
  if (!isRecord(provenance)) return false;

  const normalizedProvenance = normalizeStoredExpertRequests([provenance]);
  if (normalizedProvenance?.length !== 1) return false;

  return (
    draft.role_name === provenance.role_name &&
    draft.viewpoint === provenance.viewpoint &&
    draft.request === provenance.request
  );
}

/** 下書きの復元元候補キーも、候補本体と同じ現行形式へそろえる。 */
function normalizeStoredExpertDraftProvenanceKey(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const normalizedCandidates = normalizeStoredExpertRequests(
      JSON.parse(value),
    );

    return normalizedCandidates === undefined
      ? undefined
      : JSON.stringify(normalizedCandidates);
  } catch {
    return undefined;
  }
}

/** 旧保存済みの確認質問を、復元可能なときだけ現行形式へ収める。 */
function normalizeStoredFacilitatorUserQuestion(value: unknown) {
  if (value === null || !isRecord(value)) return null;
  if (!Array.isArray(value.options) || typeof value.required !== "boolean") {
    return null;
  }

  const question = normalizeFacilitatorText(value.question);
  const options = value.options
    .map((option) => normalizeFacilitatorText(option))
    .filter((option) => option.length > 0);

  return question && options.length >= 2 && options.includes("その他")
    ? { question, options, required: value.required }
    : null;
}

/** グループチャットの通常画面文言を、現行の200字プレーンテキストへ収める。 */
function normalizeGroupChatText(value: unknown) {
  const normalized = normalizeLegacyPlainText(value, 200);
  if (!normalized) return "";

  const candidate = {
    id: "message",
    speakerType: "expert",
    speakerName: "専門家",
    participantId: "expert",
    content: normalized,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const parsedMessage = ExpertGroupChatMessageSchema.safeParse(candidate);

  return parsedMessage.success ? parsedMessage.data.content : "";
}

/** 旧保存済み発言を、現行の表示schemaに適合するものだけ復元する。 */
function normalizeStoredGroupChatMessages(value: unknown): GroupChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeStoredGroupChatMessage)
    .filter((message): message is GroupChatMessage => message !== null);
}

function normalizeStoredGroupChatMessage(
  value: unknown,
): GroupChatMessage | null {
  const record = isRecord(value) ? value : {};
  const isLlmGroupChatMessage =
    record.speakerType === "expert" || record.speakerType === "facilitator";
  const hasLegacyAsciiQuote =
    record.speakerType === "expert" &&
    hasLeadingLegacyAsciiQuote(record.content);
  const currentMessage = GroupChatMessageSchema.safeParse(value);
  if (currentMessage.success) {
    if (currentMessage.data.speakerType === "user") {
      return currentMessage.data;
    }
    if (currentMessage.data.speakerType === "expert") {
      const currentExpertMessage =
        ExpertGroupChatMessageSchema.safeParse(value);
      if (currentExpertMessage.success && !hasLegacyAsciiQuote) {
        return currentExpertMessage.data;
      }
    }
  }

  const normalizedMessage = {
    id: normalizeRequiredText(record.id),
    speakerType: record.speakerType,
    speakerName: normalizeRequiredText(record.speakerName),
    participantId: normalizeRequiredText(record.participantId),
    content: isLlmGroupChatMessage
      ? normalizeGroupChatText(record.content)
      : record.content,
    createdAt: normalizeRequiredText(record.createdAt),
  };
  const parsedMessage = GroupChatMessageSchema.safeParse(normalizedMessage);

  return parsedMessage.success ? parsedMessage.data : null;
}

/** 旧保存済み進行ターンを、現行の表示・後続入力schemaに適合するものだけ復元する。 */
function normalizeStoredFacilitatorTurn(
  value: unknown,
): FacilitatorTurn | undefined {
  if (value === undefined) return undefined;

  const record = isRecord(value) ? value : {};
  const hasLegacyAsciiQuote = [
    record.message,
    record.requestReason,
    record.question,
  ].some(hasLeadingLegacyAsciiQuote);
  const currentTurn = FacilitatorTurnSchema.safeParse(value);
  if (currentTurn.success && !hasLegacyAsciiQuote) return currentTurn.data;

  const requestedSpeaker = isRecord(record.requestedSpeaker)
    ? record.requestedSpeaker
    : {};
  const userOptions = normalizeStoredTurnUserOptions(
    record.userOptions,
    requestedSpeaker.speakerType,
  );
  const normalizedTurn = {
    message: normalizeGroupChatText(record.message),
    requestedSpeaker: {
      speakerType: requestedSpeaker.speakerType,
      speakerName: normalizeRequiredText(requestedSpeaker.speakerName),
      participantId: normalizeRequiredText(requestedSpeaker.participantId),
    },
    requestReason: normalizeGroupChatText(record.requestReason),
    question: normalizeGroupChatText(record.question),
    userOptions,
    memoUpdate:
      record.memoUpdate === null
        ? null
        : normalizeSessionMemo(record.memoUpdate),
    contextSummaryUpdate:
      record.contextSummaryUpdate === null ||
      record.contextSummaryUpdate === undefined
        ? null
        : normalizeRequiredText(record.contextSummaryUpdate),
  };
  const parsedTurn = FacilitatorTurnSchema.safeParse(normalizedTurn);

  return parsedTurn.success ? parsedTurn.data : undefined;
}

/** 旧保存データのASCII引用だけを、現行の全角化済み通常文と区別する。 */
function hasLeadingLegacyAsciiQuote(value: unknown) {
  return typeof value === "string" && /^[ \t]*>/.test(value);
}

/** 旧ターンの「その他」は自由入力へ集約し、ユーザー選択肢を現行仕様へ復元する。 */
function normalizeStoredTurnUserOptions(value: unknown, speakerType: unknown) {
  if (speakerType !== "user") return value;

  const options = Array.isArray(value)
    ? value
        .map((option) => normalizeGroupChatText(option))
        .filter((option) => option.length > 0 && option !== "その他")
    : [];
  const uniqueOptions = [...new Set(options)];

  if (!uniqueOptions.includes("そのまま意見交換を続けて")) {
    uniqueOptions.push("そのまま意見交換を続けて");
  }
  if (uniqueOptions.length < 2) {
    uniqueOptions.push("別の考えを自由入力する");
  }

  return uniqueOptions;
}

/** 現行schemaに通らない旧メモ文字列は、APIへ送らず安全に除外する。 */
function isValidNormalizedMemoText(value: string, maximumLength: number) {
  if (!value) return false;

  const candidate: SessionMemo = {
    theme: maximumLength === 120 ? value : "未設定",
    status: "in_progress",
    facts: maximumLength === 80 ? [value] : [],
    values: [],
    concerns: [],
    options: [],
    decision_axes: [],
    expert_summaries: [],
    conflicts: [],
    open_questions: [],
    next_actions: [],
  };

  return SessionMemoSchema.safeParse(candidate).success;
}

/** 配列は空要素を除外し、現行上限の先頭3件だけを残す。 */
function normalizeMemoItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeMemoText(item, 80))
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

/** 旧保存コメントを現行の表示・後続入力制約へ正規化する。 */
function normalizeStoredExpertComments(value: unknown): ExpertComment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeStoredExpertComment)
    .filter((comment): comment is ExpertComment => comment !== null);
}

/** 現行コメントは維持し、旧形式だけを必要最小限に平文化する。 */
function normalizeStoredExpertComment(value: unknown): ExpertComment | null {
  const currentComment = ExpertCommentSchema.safeParse(value);
  if (currentComment.success) return currentComment.data;

  const record = isRecord(value) ? value : {};
  const proposal = isRecord(record.proposal) ? record.proposal : {};
  const normalizedComment = {
    role_name: normalizeRequiredText(record.role_name),
    viewpoint: normalizeRequiredText(record.viewpoint),
    summary: normalizeExpertCommentText(record.summary, 300),
    proposal: {
      id: normalizeRequiredText(proposal.id),
      name: normalizeExpertCommentText(proposal.name, 120),
      content: normalizeExpertCommentText(proposal.content, 120),
      benefits: normalizeExpertCommentItems(proposal.benefits),
      sacrifices: normalizeExpertCommentItems(proposal.sacrifices),
      conditions: normalizeExpertCommentItems(proposal.conditions),
    },
    key_point: normalizeExpertCommentText(record.key_point, 120),
    concern: normalizeExpertCommentText(record.concern, 120),
    question_to_user: normalizeExpertCommentText(record.question_to_user, 120),
    confidence: record.confidence,
    needs_research: record.needs_research,
  };
  const parsedComment = ExpertCommentSchema.safeParse(normalizedComment);

  return parsedComment.success ? parsedComment.data : null;
}

/** 専門家コメントの表示テキストが現行schemaを満たす場合だけ残す。 */
function normalizeExpertCommentText(value: unknown, maximumLength: number) {
  const normalized = normalizeLegacyPlainText(value, maximumLength);
  if (!normalized) return "";

  const candidate = {
    role_name: "専門家",
    viewpoint: "観点",
    summary: maximumLength === 300 ? normalized : "要約",
    proposal: {
      id: "proposal",
      name: maximumLength === 120 ? normalized : "案",
      content: maximumLength === 120 ? normalized : "内容",
      benefits: maximumLength === 80 ? [normalized] : ["利点"],
      sacrifices: maximumLength === 80 ? [normalized] : ["犠牲"],
      conditions: maximumLength === 80 ? [normalized] : ["条件"],
    },
    key_point: maximumLength === 120 ? normalized : "要点",
    concern: maximumLength === 120 ? normalized : "懸念",
    question_to_user: maximumLength === 120 ? normalized : "質問",
    confidence: "medium" as const,
    needs_research: false,
  };

  return ExpertCommentSchema.safeParse(candidate).success ? normalized : "";
}

/** 配列形式の表示テキストを平文化し、空要素を除外する。 */
function normalizeExpertCommentItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeExpertCommentText(item, 80))
    .filter((item) => item.length > 0);
}

/** 旧保存値の構造識別子を、空白を除いた非空文字列として確認する。 */
function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** 旧保存値の不明なstatusは、継続可能な進行中状態へ戻す。 */
function normalizeMemoStatus(value: unknown): SessionMemo["status"] {
  return value === "tentative_conclusion" ||
    value === "pending_decision" ||
    value === "pending_research" ||
    value === "pending_family_discussion" ||
    value === "action_plan"
    ? value
    : "in_progress";
}

/** unknownを安全にキー参照できるレコードか判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 端末保存値を検証し、画面表示・API送信に安全な案選択だけを返す。 */
export function getRestoredProposalState(
  parsed: StoredSession,
): RestoredProposalState {
  const commentsResult = ExpertCommentSchema.array().safeParse(
    parsed.expertComments,
  );
  const selectionResult = parsed.discussionSelection
    ? DiscussionSelectionSchema.safeParse(parsed.discussionSelection)
    : null;
  const expertComments =
    commentsResult.success &&
    stableJson(commentsResult.data) === stableJson(parsed.expertComments)
      ? commentsResult.data
      : [];
  const discussionSelection = selectionResult?.success
    ? selectionResult.data
    : null;
  const selectedProposalIds = isNonEmptyStringArray(parsed.selectedProposalIds)
    ? (parsed.selectedProposalIds as string[])
    : [];
  const proposalIds = expertComments.map((comment) => comment.proposal.id);
  const selectedByDiscussion =
    discussionSelection?.kind === "deep_dive"
      ? [discussionSelection.proposalId]
      : discussionSelection?.kind === "compare"
        ? discussionSelection.proposalIds
        : [];
  const commentsMatchExperts =
    !parsed.confirmedExperts ||
    parsed.confirmedExperts.length === 0 ||
    (parsed.confirmedExperts.length === expertComments.length &&
      parsed.confirmedExperts.every(
        (expert, index) =>
          expert.role_name === expertComments[index]?.role_name &&
          expert.viewpoint === expertComments[index]?.viewpoint,
      ));
  const areSelectedProposalIdsValid =
    selectedProposalIds.length === new Set(selectedProposalIds).size &&
    selectedProposalIds.every((id) => proposalIds.includes(id));
  const areDiscussionReferencesValid = selectedByDiscussion.every((id) =>
    proposalIds.includes(id),
  );
  const doStoredSelectionAndCheckedIdsMatch =
    discussionSelection?.kind === "deep_dive"
      ? selectedProposalIds.length === 1 &&
        selectedProposalIds[0] === discussionSelection.proposalId
      : discussionSelection?.kind === "compare"
        ? selectedProposalIds.length === 2 &&
          selectedProposalIds.every((id) =>
            discussionSelection.proposalIds.includes(id),
          )
        : discussionSelection?.kind === "defer"
          ? selectedProposalIds.length === 0
          : true;
  const areProposalIdsUnique = proposalIds.length === new Set(proposalIds).size;
  const isValid =
    expertComments.length === (parsed.expertComments?.length ?? 0) &&
    (!parsed.discussionSelection || selectionResult?.success === true) &&
    areProposalIdsUnique &&
    areSelectedProposalIdsValid &&
    areDiscussionReferencesValid &&
    doStoredSelectionAndCheckedIdsMatch &&
    commentsMatchExperts;

  return {
    expertComments: isValid ? expertComments : [],
    discussionSelection: isValid ? discussionSelection : null,
    selectedProposalIds: isValid ? selectedProposalIds : [],
    isValid,
  };
}

/** フェーズ再開に必要な初回案と選択がそろっているかを判定する。 */
export function isStoredProposalStateComplete(
  phase: Phase,
  proposalState: RestoredProposalState,
) {
  if (!isProposalStateRequired(phase)) return true;
  if (!proposalState.isValid || proposalState.expertComments.length === 0) {
    return false;
  }
  return phase === "deliberation" || proposalState.discussionSelection !== null;
}

function isStoredSessionStateMachineConsistent(
  session: StoredSession,
  proposalState: RestoredProposalState,
) {
  const phase = session.currentPhase as Phase | undefined;
  const response = session.response;
  const responseHistory = session.responseHistory ?? {};

  if (phase === undefined) return false;
  if (phase === "consultation_input") {
    return response === null && Object.keys(responseHistory).length === 0;
  }
  if (!response || response.current_phase !== phase) return false;
  if (
    !responseHistory[phase] ||
    stableJson(responseHistory[phase]) !== stableJson(response)
  ) {
    return false;
  }
  if (
    phase === "premise" &&
    response.next_action === "wait_user" &&
    !response.user_question
  ) {
    return false;
  }
  if (!isStoredProposalStateComplete(phase, proposalState)) return false;
  if (phase === "group_chat" && !session.groupChatTurn) return false;
  if (phase !== "final_memo") return session.finalMarkdown === undefined;

  const finalMarkdown = FinalMarkdownSchema.safeParse({
    markdown: session.finalMarkdown,
  });
  const finalMemoStatus = getStoredFinalMemoStatus(response, responseHistory);

  return (
    finalMarkdown.success &&
    finalMarkdown.data.markdown === session.finalMarkdown &&
    finalMemoStatus !== undefined &&
    isFinalMarkdownStatusConsistent(
      finalMarkdown.data.markdown,
      finalMemoStatus,
    )
  );
}

/** 新規相談の開始応答を横断状態へ反映する。 */
export function startSession(
  request: ConsultationStartRequest,
  facilitatorResponse: FacilitatorResponse,
  nextPhase: Phase,
): SessionState {
  const response = createResponseForPhase(facilitatorResponse, nextPhase);
  return {
    startedConsultation: request.consultation,
    response,
    responseHistory: createResponseHistoryForNewConsultation(
      facilitatorResponse,
      response,
      nextPhase,
    ),
    currentPhase: nextPhase,
  };
}

/** 前提整理の回答応答を横断状態へ反映する。 */
export function applyPremiseSessionResponse(
  state: SessionState,
  facilitatorResponse: FacilitatorResponse,
  nextPhase: Phase,
): SessionState {
  const response = createResponseForPhase(facilitatorResponse, nextPhase);
  return {
    ...state,
    currentPhase: nextPhase,
    response,
    responseHistory: {
      ...state.responseHistory,
      premise: facilitatorResponse,
      ...(nextPhase === "expert_selection"
        ? { expert_selection: response }
        : {}),
    },
  };
}

/** 前提整理を完了して専門家選定へ進む。 */
export function proceedToExpertSelection(state: SessionState): SessionState {
  if (!state.response) return state;

  const response = createResponseForPhase(state.response, "expert_selection");
  return {
    ...state,
    currentPhase: "expert_selection",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "premise"),
      premise: state.responseHistory.premise ?? state.response,
      expert_selection: response,
    },
  };
}

/** 専門家コメント生成後の検討フェーズとメモを同時に確定する。 */
export function settleExpertComments(
  state: SessionState,
  updatedMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const response = {
    ...createResponseForPhase(state.response, "deliberation"),
    memo_updates: updatedMemo,
  };
  return {
    ...state,
    currentPhase: "deliberation",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      deliberation: response,
    },
  };
}

/** 意見交換開始時のターンとメモを横断状態へ反映する。 */
export function settleGroupChatStart(
  state: SessionState,
  turn: FacilitatorTurn,
): SessionState {
  if (!state.response) return state;

  const nextResponse = createResponseForPhase(state.response, "group_chat");
  const response = turn.memoUpdate
    ? { ...nextResponse, memo_updates: turn.memoUpdate }
    : nextResponse;
  return {
    ...state,
    currentPhase: "group_chat",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      group_chat: response,
    },
  };
}

/** 意見交換中に受け取ったメモ更新を現在の応答と履歴へ反映する。 */
export function applyGroupChatMemoUpdate(
  state: SessionState,
  memoUpdate: SessionMemo,
): SessionState {
  if (!state.response || !state.responseHistory.group_chat) return state;

  return {
    ...state,
    response: { ...state.response, memo_updates: memoUpdate },
    responseHistory: {
      ...state.responseHistory,
      group_chat: {
        ...state.responseHistory.group_chat,
        memo_updates: memoUpdate,
      },
    },
  };
}

/** 終了メモの確定後、終了メモフェーズへ遷移する。 */
export function settleFinalMemo(
  state: SessionState,
  finalMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const groupChatResponse = { ...state.response, memo_updates: finalMemo };
  const response = createResponseForPhase(groupChatResponse, "final_memo");
  return {
    ...state,
    currentPhase: "final_memo",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "group_chat"),
      group_chat: groupChatResponse,
      final_memo: response,
    },
  };
}

/** 終了メモの生成失敗後、進行中のメモを保持して意見交換へ戻す。 */
export function restoreGroupChatAfterFinalMemoFailure(
  state: SessionState,
  inProgressMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const response = {
    ...createResponseForPhase(state.response, "group_chat"),
    memo_updates: inProgressMemo,
  };
  return {
    ...state,
    currentPhase: "group_chat",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "group_chat"),
      group_chat: response,
    },
  };
}

/**
 * 専門家確定後のフェーズを応答履歴へ保存する。
 * 確定候補は呼び出し元の `confirmedExperts` として別途保存し、
 * LLM 応答の `expert_requests` は上書きしない。
 */
export function saveConfirmedExperts(state: SessionState): SessionState {
  if (!state.response) return state;

  const nextPhase =
    state.currentPhase === "premise" ? "expert_selection" : state.currentPhase;
  const response = createResponseForPhase(state.response, nextPhase);
  return {
    ...state,
    currentPhase: nextPhase,
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      [nextPhase]: response,
    },
  };
}

/** 指定フェーズへ戻るため、後続する応答履歴を破棄する。 */
export function returnToPhase(
  state: SessionState,
  targetPhase: Phase,
): SessionState {
  const responseHistory =
    targetPhase === "consultation_input"
      ? clearResponseHistory()
      : keepResponsesThroughPhase(state.responseHistory, targetPhase);
  return {
    ...state,
    currentPhase: targetPhase,
    response: responseHistory[targetPhase] ?? null,
    responseHistory,
  };
}

export function getCurrentSessionMemo(state: SessionState) {
  return (
    state.response?.memo_updates ??
    getLatestMemoBeforePhase(state.responseHistory, state.currentPhase)
  );
}

export function getAvailableReturnPhases(state: SessionState) {
  return getReturnablePhases(state.currentPhase, state.responseHistory);
}

export function createSessionRequest({
  consultation,
  facts,
  values,
  concerns,
  expectedOutcome,
  userQuestionAnswer,
  state,
}: {
  consultation: string;
  facts: string;
  values: string;
  concerns: string;
  expectedOutcome: string;
  userQuestionAnswer?: string;
  state: SessionState;
}): ConsultationRequest {
  return {
    consultation,
    facts: emptyToUndefined(facts),
    values: emptyToUndefined(values),
    concerns: emptyToUndefined(concerns),
    expectedOutcome: emptyToUndefined(expectedOutcome),
    userQuestion: state.response?.user_question ?? undefined,
    userQuestionAnswer,
    currentPhase: state.currentPhase,
    memo: getCurrentSessionMemo(state) ?? undefined,
  };
}

export function createStoredSession({
  request,
  state,
  expertComments,
  expertDrafts,
  expertDraftProvenanceKey,
  initialExpertRequests,
  confirmedExperts,
  groupChatMessages,
  groupChatTurn,
  groupChatContextSummary,
  groupChatExpertRepliesSinceUser,
  groupChatNextTurnRetryPending,
  discussionSelection,
  selectedProposalIds,
  finalMarkdown,
}: Omit<
  StoredSession,
  "response" | "responseHistory" | "currentPhase" | "startedConsultation"
> & {
  state: SessionState;
}): StoredSession {
  return {
    request,
    startedConsultation: state.startedConsultation || undefined,
    response: state.response,
    responseHistory: state.responseHistory,
    currentPhase: state.currentPhase,
    expertComments,
    expertDrafts,
    expertDraftProvenanceKey: expertDraftProvenanceKey ?? undefined,
    confirmedExperts,
    groupChatMessages,
    groupChatTurn: groupChatTurn ?? undefined,
    groupChatContextSummary: groupChatContextSummary || undefined,
    groupChatExpertRepliesSinceUser,
    groupChatNextTurnRetryPending: groupChatNextTurnRetryPending || undefined,
    discussionSelection,
    selectedProposalIds,
    initialExpertRequests,
    finalMarkdown: finalMarkdown || undefined,
  };
}

function isProposalStateRequired(phase: Phase) {
  return (
    phase === "deliberation" || phase === "group_chat" || phase === "final_memo"
  );
}

function getLatestMemoBeforePhase(
  responseHistory: ResponseHistory,
  targetPhase: Phase,
) {
  const targetIndex = phaseOrder.indexOf(targetPhase);

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const phase = phaseOrder[index];
    const memo = responseHistory[phase]?.memo_updates;
    if (memo) return memo;
  }

  return null;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
