import type {
  ConsultationStartRequest,
  FacilitatorResponse,
} from "../../shared/schemas/session";
import type { ConsultationStartInput } from "../facilitator-flow";
import { ConsultationInputPhase } from "./ConsultationInputPhase";

type ConsultationInputState = ConsultationStartInput & {
  changeConsultation: (value: string) => void;
  changeFacts: (value: string) => void;
  changeValues: (value: string) => void;
  changeConcerns: (value: string) => void;
  changeExpectedOutcome: (value: string) => void;
};

/** 日本語名: 相談入力の状態と開始フローを画面コンポーネントへ接続する。 */
export function ConsultationInputPhaseConnection({
  input,
  isBusy,
  hasResponse,
  errorMessage,
  canRetry,
  start,
  resetSession,
  applyStartedSession,
  retry,
}: {
  input: ConsultationInputState;
  isBusy: boolean;
  hasResponse: boolean;
  errorMessage: string;
  canRetry: boolean;
  start: (options: {
    input: ConsultationStartInput;
    onBeforeRequest: () => void;
    onSuccess: (
      request: ConsultationStartRequest,
      response: FacilitatorResponse,
    ) => void;
  }) => Promise<void>;
  resetSession: () => void;
  applyStartedSession: (
    request: ConsultationStartRequest,
    response: FacilitatorResponse,
  ) => void;
  retry: () => Promise<void>;
}) {
  return (
    <ConsultationInputPhase
      consultation={input.consultation}
      facts={input.facts}
      values={input.values}
      concerns={input.concerns}
      expectedOutcome={input.expectedOutcome}
      isBusy={isBusy}
      hasResponse={hasResponse}
      errorMessage={errorMessage}
      canRetry={canRetry}
      onConsultationChange={input.changeConsultation}
      onFactsChange={input.changeFacts}
      onValuesChange={input.changeValues}
      onConcernsChange={input.changeConcerns}
      onExpectedOutcomeChange={input.changeExpectedOutcome}
      onStart={() =>
        void start({
          input: {
            consultation: input.consultation,
            facts: input.facts,
            values: input.values,
            concerns: input.concerns,
            expectedOutcome: input.expectedOutcome,
          },
          onBeforeRequest: resetSession,
          onSuccess: applyStartedSession,
        })
      }
      onRetry={() => void retry()}
    />
  );
}
