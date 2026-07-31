import type {
  ExpertRequest,
  FacilitatorResponse,
} from "../../shared/schemas/session";
import type { ExpertDraft } from "../hooks/use-expert-selection-phase";
import { ExpertSelectionPhase } from "./ExpertSelectionPhase";

/** 日本語名: 専門家選定の編集・確定・生成操作を画面コンポーネントへ接続する。 */
export function ExpertSelectionPhaseConnection({
  response,
  expertDrafts,
  confirmedExperts,
  isDisabled,
  isGenerating,
  errorMessage,
  updateExpertDraft,
  addExpertDraft,
  removeExpertDraft,
  replaceExpertDraft,
  confirmInitialDrafts,
  confirmDrafts,
  generateComments,
}: {
  response: FacilitatorResponse | null;
  expertDrafts: ExpertDraft[];
  confirmedExperts: ExpertRequest[];
  isDisabled: boolean;
  isGenerating: boolean;
  errorMessage: string;
  updateExpertDraft: (
    index: number,
    field: keyof ExpertRequest,
    value: string,
  ) => void;
  addExpertDraft: () => void;
  removeExpertDraft: (index: number) => void;
  replaceExpertDraft: (index: number) => void;
  confirmInitialDrafts: () => void;
  confirmDrafts: () => void;
  generateComments: () => Promise<void>;
}) {
  if (!response || response.expert_requests.length === 0) return null;

  return (
    <ExpertSelectionPhase
      expertDrafts={expertDrafts}
      confirmedExperts={confirmedExperts}
      isDisabled={isDisabled}
      isGenerating={isGenerating}
      errorMessage={errorMessage}
      onUpdate={updateExpertDraft}
      onAdd={addExpertDraft}
      onRemove={removeExpertDraft}
      onReplace={replaceExpertDraft}
      onConfirmInitial={confirmInitialDrafts}
      onConfirm={confirmDrafts}
      onGenerate={() => void generateComments()}
    />
  );
}
