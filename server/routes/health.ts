import type { RequestHandler } from "express";

/**
 * APIサーバーの稼働状態を返すハンドラ。
 *
 * 日本語名: ヘルスチェックAPI。
 */
export const healthHandler: RequestHandler = (_request, response) => {
  response.json({ ok: true });
};
