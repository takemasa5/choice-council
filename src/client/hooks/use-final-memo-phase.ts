import { useState } from "react";
import type {
  ExpertComment,
  FinalMarkdown,
  FinalMarkdownRequest,
  FinalSessionMemo,
  SessionMemo,
} from "../../shared/schemas/session";

/**
 * 日本語名: 終了メモの生成結果・進行中・エラー状態を管理するHook。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#グループチャットと終了フローの分離`。
 */
export function useFinalMemoPhase() {
  const [finalMarkdown, setFinalMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /** 日本語名: 終了メモ生成APIを呼び出し、結果をフェーズ状態へ反映する操作。 */
  async function generate({
    consultation,
    memo,
    expertComments,
    requiredQuestionMessage,
    onComplete,
  }: {
    consultation: string;
    memo: SessionMemo | null;
    expertComments: ExpertComment[];
    requiredQuestionMessage: string;
    onComplete: () => void;
  }) {
    setErrorMessage("");
    if (requiredQuestionMessage)
      return setErrorMessage(requiredQuestionMessage);
    if (!memo)
      return setErrorMessage(
        "終了メモを作るためのセッションメモがまだありません。",
      );
    if (memo.status === "in_progress")
      return setErrorMessage(
        "終了メモ生成前に、方向性整理または次アクション確認まで進めてください。",
      );

    const request: FinalMarkdownRequest = {
      consultation,
      memo: memo as FinalSessionMemo,
      expertComments: expertComments.length > 0 ? expertComments : undefined,
    };
    setIsGenerating(true);
    try {
      const response = await fetch("/api/final-markdown/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok)
        return setErrorMessage(
          body.message ?? "この発言の生成に失敗しました。再生成できます。",
        );
      setFinalMarkdown((body as FinalMarkdown).markdown);
      onComplete();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "終了メモの生成に失敗しました。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  /** 日本語名: 生成済みMarkdownをローカルファイルとして保存する操作。 */
  function download() {
    if (!finalMarkdown) return;
    const url = URL.createObjectURL(
      new Blob([finalMarkdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "choice-council-memo.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return {
    finalMarkdown,
    setFinalMarkdown,
    isGenerating,
    setIsGenerating,
    errorMessage,
    setErrorMessage,
    generate,
    download,
  };
}
