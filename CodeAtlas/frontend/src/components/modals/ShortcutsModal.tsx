import { useEffect } from "react";
import { X } from "lucide-react";

export function ShortcutsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: "⌘ K / Ctrl+K", action: "Open Command Palette" },
    { key: "⌘ B / Ctrl+B", action: "Toggle Contextual Right Panel" },
    { key: "1 - 9", action: "Quick jump to navigation pages" },
    { key: "Esc", action: "Close modal / reset selection" },
    { key: "?", action: "Show keyboard shortcuts" },
    { key: "F", action: "Focus search in File / Node lists" },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-list">
            {shortcuts.map((s) => (
              <div key={s.key} className="shortcut-row">
                <span className="shortcut-action">{s.action}</span>
                <kbd className="shortcut-kbd">{s.key}</kbd>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
