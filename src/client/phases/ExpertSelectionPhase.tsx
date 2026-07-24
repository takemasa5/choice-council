import { maximumExpertRequestCount } from "../../shared/schemas/session";
import type { ExpertRequest } from "../../shared/schemas/session";

/** 日本語名: 編集中の専門家候補。 */
export type ExpertDraft = ExpertRequest & { draftId: string };

/** 日本語名: 専門家候補の編集・確定・コメント生成を担うフェーズUI。 */
export function ExpertSelectionPhase({
  expertDrafts,
  confirmedExperts,
  isDisabled,
  isGenerating,
  errorMessage,
  onUpdate,
  onAdd,
  onRemove,
  onReplace,
  onConfirmInitial,
  onConfirm,
  onGenerate,
}: {
  expertDrafts: ExpertDraft[];
  confirmedExperts: ExpertRequest[];
  isDisabled: boolean;
  isGenerating: boolean;
  errorMessage: string;
  onUpdate: (index: number, field: keyof ExpertRequest, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReplace: (index: number) => void;
  onConfirmInitial: () => void;
  onConfirm: () => void;
  onGenerate: () => void;
}) {
  return (
    <section className="expert-request-box" aria-label="専門家ロール候補">
      <h3>専門家ロール候補</h3>
      <div className="expert-request-list">
        {expertDrafts.map((expert, index) => (
          <article className="expert-request-item" key={expert.draftId}>
            <label className="field compact-field">
              <span>専門家</span>
              <input
                value={expert.role_name}
                onChange={(event) =>
                  onUpdate(index, "role_name", event.target.value)
                }
                disabled={isDisabled}
              />
            </label>
            <label className="field compact-field">
              <span>観点</span>
              <textarea
                value={expert.viewpoint}
                onChange={(event) =>
                  onUpdate(index, "viewpoint", event.target.value)
                }
                rows={2}
                disabled={isDisabled}
              />
            </label>
            <label className="field compact-field">
              <span>依頼</span>
              <textarea
                value={expert.request}
                onChange={(event) =>
                  onUpdate(index, "request", event.target.value)
                }
                rows={2}
                disabled={isDisabled}
              />
            </label>
            <div className="expert-row-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => onReplace(index)}
                disabled={isDisabled}
              >
                入れ替え
              </button>
              <button
                className="text-button danger"
                type="button"
                onClick={() => onRemove(index)}
                disabled={isDisabled}
              >
                外す
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="expert-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onAdd}
          disabled={
            isDisabled || expertDrafts.length >= maximumExpertRequestCount
          }
        >
          専門家を追加する
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onConfirmInitial}
          disabled={isDisabled}
        >
          おまかせで進める
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onConfirm}
          disabled={isDisabled}
        >
          このまま進める
        </button>
      </div>
      {confirmedExperts.length > 0 && (
        <div className="confirmed-experts">
          <strong>確定済み</strong>
          <ul>
            {confirmedExperts.map((expert) => (
              <li key={`${expert.role_name}-${expert.viewpoint}`}>
                {expert.role_name} / {expert.viewpoint}
              </li>
            ))}
          </ul>
          <button
            className="primary-button"
            type="button"
            onClick={onGenerate}
            disabled={isDisabled}
          >
            {isGenerating ? "生成中..." : "専門家コメントを生成する"}
          </button>
        </div>
      )}
      {errorMessage && <p className="error">{errorMessage}</p>}
    </section>
  );
}
