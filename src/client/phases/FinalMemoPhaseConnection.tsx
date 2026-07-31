import { FinalMemoPhase } from "./FinalMemoPhase";

/** 日本語名: 終了メモの表示・ダウンロードをサイドパネルへ接続する。 */
export function FinalMemoPhaseConnection({
  isVisible,
  isGenerating,
  finalMarkdown,
  download,
}: {
  isVisible: boolean;
  isGenerating: boolean;
  finalMarkdown: string;
  download: () => void;
}) {
  if (!isVisible) return null;

  return (
    <FinalMemoPhase
      isGenerating={isGenerating}
      finalMarkdown={finalMarkdown}
      onDownload={download}
    />
  );
}
