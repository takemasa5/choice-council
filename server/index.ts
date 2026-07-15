import { createApp } from "./app";

/** APIサーバーの待受ポート。 */
const port = Number(process.env.PORT ?? 3001);
/** Expressアプリケーション本体。 */
const app = createApp();

app.listen(port, "127.0.0.1", () => {
  console.log(`Choice Council API listening on http://127.0.0.1:${port}`);
});
