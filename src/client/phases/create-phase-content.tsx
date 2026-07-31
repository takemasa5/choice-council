import type { ReactNode } from "react";
import type { Phase } from "../../shared/schemas/session";
import { ConsultationInputPhaseConnection } from "./ConsultationInputPhaseConnection";
import { DeliberationPhaseConnection } from "./DeliberationPhaseConnection";
import { ExpertSelectionPhaseConnection } from "./ExpertSelectionPhaseConnection";
import { GroupChatPhaseConnection } from "./GroupChatPhaseConnection";
import { PremisePhaseConnection } from "./PremisePhaseConnection";

type ConsultationInputConnectionProps = Parameters<
  typeof ConsultationInputPhaseConnection
>[0];
type PremiseConnectionProps = Parameters<typeof PremisePhaseConnection>[0];
type ExpertSelectionConnectionProps = Parameters<
  typeof ExpertSelectionPhaseConnection
>[0];
type DeliberationConnectionProps = Parameters<
  typeof DeliberationPhaseConnection
>[0];
type GroupChatConnectionProps = Parameters<typeof GroupChatPhaseConnection>[0];

/** 日本語名: フェーズ別接続コンポーネントをフェーズルーター用の内容へ変換する。 */
export function createPhaseContent(
  consultationInput: ConsultationInputConnectionProps,
  premise: PremiseConnectionProps,
  expertSelection: ExpertSelectionConnectionProps,
  deliberation: DeliberationConnectionProps,
  groupChat: GroupChatConnectionProps,
): Record<Phase, ReactNode> {
  return {
    consultation_input: (
      <ConsultationInputPhaseConnection {...consultationInput} />
    ),
    premise: <PremisePhaseConnection {...premise} />,
    expert_selection: <ExpertSelectionPhaseConnection {...expertSelection} />,
    deliberation: <DeliberationPhaseConnection {...deliberation} />,
    group_chat: <GroupChatPhaseConnection {...groupChat} />,
    final_memo: null,
  };
}
