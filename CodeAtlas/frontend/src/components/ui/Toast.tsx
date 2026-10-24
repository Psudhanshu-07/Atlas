import { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast-item toast-${toast.type}`} role="alert">
      <div className="toast-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {toast.type === "success" && <CheckCircle2 size={15} />}
        {toast.type === "error" && <AlertCircle size={15} />}
        {toast.type === "warning" && <AlertTriangle size={15} />}
        {toast.type === "info" && <Info size={15} />}
      </div>
      <div className="toast-content">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-msg">{toast.message}</div>
      </div>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss toast" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={13} />
      </button>
    </div>
  );
}
