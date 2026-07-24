/** 日本語名: 前提整理を確認し、専門家選定へ進む操作を表示するフェーズUI。 */
export function PremisePhase({
  canProceed,
  isBusy,
  onProceed,
}: {
  canProceed: boolean;
  isBusy: boolean;
  onProceed: () => void;
}) {
  if (!canProceed) return null;

  return (
    <button
      className="primary-button"
      type="button"
      onClick={onProceed}
      disabled={isBusy}
    >
      専門家選定へ進む
    </button>
  );
}
