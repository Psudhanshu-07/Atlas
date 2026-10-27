import { useState } from "react";
import { api } from "../../api";
import { ConfirmationDialog, Spinner } from "../ui";
import { Download, Trash2 } from "lucide-react";
import { Card } from "./SettingsCard";

export function DataSection({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exportChats = async () => {
    try {
      const res = await fetch("/api/chats/export");
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "atlas-chat-history.json";
      a.click();
      URL.revokeObjectURL(url);
      onShowToast("Chat history downloaded.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not export chat history.");
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    try {
      const res = await api.deleteAllChats();
      onShowToast(`Deleted ${res.deleted} conversation${res.deleted === 1 ? "" : "s"}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not delete chat history.");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Card
        title="Chat history"
        description="Your Atlas conversations are stored per-account on this workspace."
      >
        <div className="settings-inline-row">
          <div className="flex flex-col gap-0.5">
            <span className="form-label" style={{ marginBottom: 0 }}>
              Export conversations
            </span>
            <span className="form-help-text" style={{ marginTop: 0 }}>
              Download every conversation and message as JSON.
            </span>
          </div>
          <button className="btn ghost" onClick={() => void exportChats()}>
            <Download size={14} /> Export
          </button>
        </div>
        <div className="settings-inline-row">
          <div className="flex flex-col gap-0.5">
            <span className="form-label" style={{ marginBottom: 0 }}>
              Delete all conversations
            </span>
            <span className="form-help-text" style={{ marginTop: 0 }}>
              Permanently removes every chat on your account. Repositories and analyses are untouched.
            </span>
          </div>
          <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={deleting}>
            {deleting ? <Spinner size={13} /> : <Trash2 size={14} />} Delete all
          </button>
        </div>
      </Card>

      <ConfirmationDialog
        isOpen={confirmOpen}
        title="Delete all chat history"
        message="Every Atlas conversation and message on your account will be permanently deleted. This cannot be undone."
        confirmLabel="Delete everything"
        confirmVariant="danger"
        onConfirm={() => void deleteAll()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
