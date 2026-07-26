import { useState } from "react";
import type {
  ExpertComment,
  FinalMarkdown,
  FinalMarkdownRequest,
  FinalMemoStatus,
  FinalSessionMemo,
  SessionMemo,
} from "../../shared/schemas/session";
import { resetFinalMemoStatus, setFinalMemoStatus } from "../final-memo-flow";

/**
 * 日本語名: 終了メモの生成結果・進行中・エラー状態を管理するHook。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#グループチャットと終了フローの分離`。
 */
export function useFinalMemoPhase() {
  const [finalMarkdown, setFinalMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /** 日本語名: 終了状態を確定し、終了メモ生成APIを自動で呼び出す操作。 */
  async function finish({
    consultation,
    memo,
    status,
    expertComments,
    onStatusConfirmed,
    onGenerationFailed,
    onComplete,
  }: {
    consultation: string;
    memo: SessionMemo | null;
    status: FinalMemoStatus;
    expertComments: ExpertComment[];
    onStatusConfirmed: (memo: FinalSessionMemo) => void;
    onGenerationFailed: (memo: SessionMemo) => void;
    onComplete: () => void;
  }) {
    setErrorMessage("");
    if (!memo)
      return setErrorMessage(
        "終了メモを作るためのセッションメモがまだありません。",
      );

    const finalMemo = setFinalMemoStatus(memo, status);
    onStatusConfirmed(finalMemo);

    const request: FinalMarkdownRequest = {
      consultation,
      memo: finalMemo,
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
      if (!response.ok) {
        throw new Error(
          body.message ?? "終了メモの生成に失敗しました。再試行してください。",
        );
      }
      setFinalMarkdown((body as FinalMarkdown).markdown);
      onComplete();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "終了メモの生成に失敗しました。",
      );
      onGenerationFailed(resetFinalMemoStatus(finalMemo));
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
    finish,
    download,
  };
}
