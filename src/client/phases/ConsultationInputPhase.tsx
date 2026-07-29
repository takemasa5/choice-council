/**
 * 日本語名: 相談内容の入力と相談開始を担当するフェーズUI。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#完成イメージ`。
 */
export function ConsultationInputPhase({
  consultation,
  facts,
  values,
  concerns,
  expectedOutcome,
  isBusy,
  hasResponse,
  errorMessage,
  canRetry,
  onConsultationChange,
  onFactsChange,
  onValuesChange,
  onConcernsChange,
  onExpectedOutcomeChange,
  onStart,
  onRetry,
}: {
  consultation: string;
  facts: string;
  values: string;
  concerns: string;
  expectedOutcome: string;
  isBusy: boolean;
  hasResponse: boolean;
  errorMessage: string;
  canRetry: boolean;
  onConsultationChange: (value: string) => void;
  onFactsChange: (value: string) => void;
  onValuesChange: (value: string) => void;
  onConcernsChange: (value: string) => void;
  onExpectedOutcomeChange: (value: string) => void;
  onStart: () => void;
  onRetry: () => void;
}) {
  const { showOptionalFields, toggleOptionalFields } = useConsultationPhase();

  return (
    <div className="panel">
      <h2>相談内容</h2>
      <label className="field">
        <span>相談内容</span>
        <textarea
          value={consultation}
          onChange={(event) => onConsultationChange(event.target.value)}
          placeholder="例: 夏休みの家族旅行で、予算を抑えながら子どもも楽しめる行き先を家族で決めたいです。"
          rows={7}
        />
      </label>
      <button
        className="text-button"
        type="button"
        onClick={toggleOptionalFields}
      >
        {showOptionalFields ? "任意項目を閉じる" : "任意項目を開く"}
      </button>
      {showOptionalFields && (
        <div className="optional-grid">
          <InputField
            label="事実・背景"
            value={facts}
            rows={3}
            onChange={onFactsChange}
          />
          <InputField
            label="重視したいこと"
            value={values}
            rows={3}
            onChange={onValuesChange}
          />
          <InputField
            label="不安なこと"
            value={concerns}
            rows={3}
            onChange={onConcernsChange}
          />
          <InputField
            label="期待する結果"
            value={expectedOutcome}
            rows={3}
            onChange={onExpectedOutcomeChange}
          />
        </div>
      )}
      <div className="action-row">
        <button
          className="primary-button"
          type="button"
          onClick={onStart}
          disabled={isBusy}
        >
          {isBusy
            ? "整理中..."
            : hasResponse
              ? "もう一度整理する"
              : "相談を開始する"}
        </button>
      </div>
      {errorMessage && (
        <div className="error-block">
          <p className="error">{errorMessage}</p>
          {canRetry && (
            <button
              className="secondary-button"
              type="button"
              onClick={onRetry}
              disabled={isBusy}
            >
              {isBusy ? "リトライ中..." : "同じ内容でリトライ"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 日本語名: 任意入力欄を共通表示する小さなUI部品。 */
function InputField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
      />
    </label>
  );
}
import { useConsultationPhase } from "../hooks/use-consultation-phase";
