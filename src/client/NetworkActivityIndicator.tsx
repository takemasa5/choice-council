/** 日本語名: LLM・API 通信中であることを画面共通で示すインジケータ。 */
export function NetworkActivityIndicator({
  isActive,
  className,
  message = "通信中",
}: {
  isActive: boolean;
  className?: string;
  message?: string;
}) {
  if (!isActive) return null;

  return (
    <p
      className={`network-activity${className ? ` ${className}` : ""}`}
      aria-live="polite"
      role="status"
    >
      <span className="network-activity-spinner" aria-hidden="true" />
      {message}
    </p>
  );
}
