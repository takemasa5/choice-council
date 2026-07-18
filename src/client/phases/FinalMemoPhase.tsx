/** 日本語名: 終了メモの生成、表示、保存を担当するフェーズUI。 */
export function FinalMemoPhase({
  canGenerate,
  isGenerating,
  finalMarkdown,
  errorMessage,
  onGenerate,
  onDownload,
}: {
  canGenerate: boolean;
  isGenerating: boolean;
  finalMarkdown: string;
  errorMessage: string;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  return (
    <>
      <button
        className="primary-button"
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        {isGenerating ? "終了メモ生成中..." : "終了メモを生成"}
      </button>
      {finalMarkdown && (
        <button className="secondary-button" type="button" onClick={onDownload}>
          Markdown保存
        </button>
      )}
      {errorMessage && <p className="error">{errorMessage}</p>}
      {finalMarkdown && (
        <section
          className="final-markdown-preview"
          aria-label="Markdown終了メモ"
        >
          <h3>Markdown終了メモ</h3>
          <pre>{finalMarkdown}</pre>
        </section>
      )}
    </>
  );
}
