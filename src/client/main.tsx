import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ConsultationRequest,
  FacilitatorResponse,
  Phase,
  SessionMemo
} from "../shared/schemas/session";
import "./styles.css";

const storageKey = "choice-council-session";
const phaseOrder: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "direction",
  "final_memo"
];

const phaseLabels: Record<Phase, string> = {
  consultation_input: "相談入力",
  premise: "前提整理",
  expert_selection: "専門家選定",
  deliberation: "検討",
  direction: "方向性整理",
  final_memo: "終了メモ"
};

const nextActionLabels: Record<FacilitatorResponse["next_action"], string> = {
  wait_user: "ユーザー回答待ち",
  request_experts: "専門家コメント生成候補",
  update_memo: "セッションメモ更新候補",
  move_phase: "次フェーズ候補",
  finish: "終了候補"
};

type StoredSession = {
  request: ConsultationRequest;
  response: FacilitatorResponse | null;
  currentPhase: Phase;
};

function App() {
  const [consultation, setConsultation] = useState("");
  const [facts, setFacts] = useState("");
  const [values, setValues] = useState("");
  const [concerns, setConcerns] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [response, setResponse] = useState<FacilitatorResponse | null>(null);
  const [currentPhase, setCurrentPhase] = useState<Phase>("consultation_input");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pauseRequested, setPauseRequested] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as StoredSession;
      setConsultation(parsed.request.consultation);
      setFacts(parsed.request.facts ?? "");
      setValues(parsed.request.values ?? "");
      setConcerns(parsed.request.concerns ?? "");
      setExpectedOutcome(parsed.request.expectedOutcome ?? "");
      setResponse(parsed.response);
      setCurrentPhase(parsed.currentPhase ?? parsed.response?.current_phase ?? "consultation_input");
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    const request = buildRequest();
    const session: StoredSession = { request, response, currentPhase };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, [consultation, facts, values, concerns, expectedOutcome, response, currentPhase]);

  const memo = useMemo<SessionMemo | null>(() => {
    return response?.memo_updates ?? null;
  }, [response]);
  const availableReturnPhases = useMemo(() => {
    return getReturnablePhases(currentPhase);
  }, [currentPhase]);

  async function startSession() {
    setErrorMessage("");

    const request = buildRequest();
    if (!request.consultation.trim()) {
      setErrorMessage("相談内容を入力してください。");
      return;
    }

    setIsLoading(true);
    setPauseRequested(false);

    try {
      const apiResponse = await fetch("/api/facilitator/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });

      const body = await apiResponse.json();

      if (!apiResponse.ok) {
        setErrorMessage(body.message ?? "ファシリテーター応答の生成に失敗しました。");
        return;
      }

      const facilitatorResponse = body as FacilitatorResponse;
      if (!isAllowedModelPhase("consultation_input", facilitatorResponse.current_phase)) {
        setErrorMessage("現在のフェーズから許可されていない応答が返されました。");
        return;
      }

      setCurrentPhase(facilitatorResponse.current_phase);
      setResponse(facilitatorResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "通信に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  function buildRequest(): ConsultationRequest {
    return {
      consultation,
      facts: emptyToUndefined(facts),
      values: emptyToUndefined(values),
      concerns: emptyToUndefined(concerns),
      expectedOutcome: emptyToUndefined(expectedOutcome)
    };
  }

  function clearSession() {
    window.localStorage.removeItem(storageKey);
    setConsultation("");
    setFacts("");
    setValues("");
    setConcerns("");
    setExpectedOutcome("");
    setResponse(null);
    setCurrentPhase("consultation_input");
    setErrorMessage("");
    setPauseRequested(false);
  }

  function returnToPhase(targetPhase: Phase) {
    const confirmed = window.confirm(
      "このフェーズに戻ると、以降の整理内容と生成結果は破棄されます。戻りますか？"
    );

    if (!confirmed) return;

    setCurrentPhase(targetPhase);
    setResponse(null);
    setErrorMessage("");
    setPauseRequested(false);
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="現在の進行状況">
        <div>
          <p className="eyebrow">Choice Council</p>
          <h1>複数の視点で、決めきれない相談を整理する</h1>
        </div>
        <div className="phase-pill">
          {phaseLabels[currentPhase]}
        </div>
      </section>

      <section className="workspace">
        <section className="timeline" aria-label="相談タイムライン">
          <div className="panel">
            <h2>相談内容</h2>
            <label className="field">
              <span>相談内容</span>
              <textarea
                value={consultation}
                onChange={(event) => setConsultation(event.target.value)}
                placeholder="例: 小5の娘の中学受験をするか迷っています。本人の負担と将来の選択肢のどちらを重視すべきか整理したいです。"
                rows={7}
              />
            </label>

            <button
              className="text-button"
              type="button"
              onClick={() => setShowOptionalFields((current) => !current)}
            >
              {showOptionalFields ? "任意項目を閉じる" : "任意項目を開く"}
            </button>

            {showOptionalFields && (
              <div className="optional-grid">
                <label className="field">
                  <span>事実・背景</span>
                  <textarea value={facts} onChange={(event) => setFacts(event.target.value)} rows={3} />
                </label>
                <label className="field">
                  <span>重視したいこと</span>
                  <textarea value={values} onChange={(event) => setValues(event.target.value)} rows={3} />
                </label>
                <label className="field">
                  <span>不安なこと</span>
                  <textarea value={concerns} onChange={(event) => setConcerns(event.target.value)} rows={3} />
                </label>
                <label className="field">
                  <span>期待する結果</span>
                  <textarea
                    value={expectedOutcome}
                    onChange={(event) => setExpectedOutcome(event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
            )}

            <div className="action-row">
              <button className="primary-button" type="button" onClick={startSession} disabled={isLoading}>
                {isLoading ? "整理中..." : response ? "もう一度整理する" : "相談を開始する"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPauseRequested(true)}
                disabled={!isLoading}
              >
                ちょっと待って
              </button>
            </div>

            {pauseRequested && <p className="notice">次の区切りで止めます。</p>}
            {errorMessage && <p className="error">{errorMessage}</p>}
          </div>

          {response && (
            <article className="message-card">
              <div className="message-label">ファシリテーター</div>
              <p>{response.facilitator_message}</p>
              <p className="next-action">候補行動: {nextActionLabels[response.next_action]}</p>

              {response.user_question && (
                <div className="question-box">
                  <strong>{response.user_question.question}</strong>
                  <div className="option-list">
                    {response.user_question.options.map((option) => (
                      <button type="button" key={option}>
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          )}

          {availableReturnPhases.length > 0 && (
            <section className="panel">
              <h2>前フェーズへ戻る</h2>
              <div className="phase-return-list">
                {availableReturnPhases.map((phase) => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={phase}
                    onClick={() => returnToPhase(phase)}
                  >
                    {phaseLabels[phase]}へ戻る
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>

        <aside className="side-panel" aria-label="セッションメモ">
          <div className="panel">
            <div className="side-header">
              <h2>セッションメモ</h2>
              <button className="text-button danger" type="button" onClick={clearSession}>
                削除
              </button>
            </div>
            <p className="privacy-note">この端末に一時保存されます。</p>
            {memo ? <MemoView memo={memo} /> : <p className="empty">相談を開始すると、前提や未確認事項をここに整理します。</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function getReturnablePhases(currentPhase: Phase) {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex <= 0) return [];

  return phaseOrder.slice(0, currentIndex);
}

function isAllowedModelPhase(currentPhase: Phase, modelPhase: Phase) {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const modelIndex = phaseOrder.indexOf(modelPhase);

  return modelIndex === currentIndex || modelIndex === currentIndex + 1;
}

function MemoView({ memo }: { memo: SessionMemo }) {
  return (
    <div className="memo-list">
      <MemoSection title="相談テーマ" items={memo.theme ? [memo.theme] : []} />
      <MemoSection title="整理した事実" items={memo.facts} />
      <MemoSection title="重視したこと" items={memo.values} />
      <MemoSection title="不安や懸念" items={memo.concerns} />
      <MemoSection title="未確認事項" items={memo.open_questions} />
      <MemoSection title="次アクション候補" items={memo.next_actions} />
    </div>
  );
}

function MemoSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty small">未整理</p>
      )}
    </section>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
