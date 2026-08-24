import { MarkdownDocument } from "../MarkdownDocument";

/** 日本語名: 終了メモの生成、表示、保存を担当するフェーズUI。 */
export function FinalMemoPhase({
  isGenerating,
  finalMarkdown,
  onDownload,
}: {
  isGenerating: boolean;
  finalMarkdown: string;
  onDownload: () => void;
}) {
  return (
    <>
      {isGenerating && <p className="notice">終了メモを生成中です...</p>}
      {finalMarkdown && (
        <button className="secondary-button" type="button" onClick={onDownload}>
          Markdown保存
        </button>
      )}
      {finalMarkdown && (
        <section
          className="final-markdown-preview"
          aria-label="Markdown終了メモ"
        >
          <h3>Markdown終了メモ</h3>
          <MarkdownDocument markdown={finalMarkdown} />
        </section>
      )}
    </>
  );
}
