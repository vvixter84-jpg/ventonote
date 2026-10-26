import type { Toast } from "../types";

interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span className="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              className="toast__action"
              type="button"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            className="toast__close"
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
