export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="banner-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
