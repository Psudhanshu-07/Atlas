import { useState } from "react";
import { api, apiUrl, type SessionUser } from "../../api";
import { ConfirmationDialog, Spinner } from "../ui";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "./SettingsCard";

export function DataSection({
  user,
  onShowToast,
  onSignOut,
}: {
  user: SessionUser;
  onShowToast: (msg: string) => void;
  onSignOut: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reauthValue, setReauthValue] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const exportChats = async () => {
    try {
      // apiUrl: on split deployments (Vercel client + Render API) a relative
      // path would hit the client host and 404 instead of downloading.
      const res = await fetch(apiUrl("/api/chats/export"), { credentials: "include" });
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

  const exportAccount = async () => {
    try {
      const res = await fetch(api.exportAccountUrl(), { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atlas-account-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast("Account data downloaded.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not export account data.");
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

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api.deleteAccount(
        user.hasPassword ? { password: reauthValue } : { confirmEmail: reauthValue },
      );
      onShowToast("Account deleted. Goodbye.");
      onSignOut();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not delete the account.");
    } finally {
      setDeletingAccount(false);
      setReauthValue("");
    }
  };

  const reauthOk = reauthValue.trim().length > 0;

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

      <Card
        title="Your data"
        description="Export everything Atlas stores about you, or permanently delete the account."
      >
        <div className="settings-inline-row">
          <div className="flex flex-col gap-0.5">
            <span className="form-label" style={{ marginBottom: 0 }}>
              Export all account data
            </span>
            <span className="form-help-text" style={{ marginTop: 0 }}>
              Profile, preferences, analyses, repositories, sessions and chats as one JSON file.
            </span>
          </div>
          <button className="btn ghost" onClick={() => void exportAccount()}>
            <Download size={14} /> Export
          </button>
        </div>

        <div className="settings-inline-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div className="flex flex-col gap-0.5">
            <span className="form-label" style={{ marginBottom: 0, color: "var(--error, #f85149)" }}>
              <ShieldAlert size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Delete account
            </span>
            <span className="form-help-text" style={{ marginTop: 0 }}>
              Permanently removes your account, analyses, repositories, sessions and chats. This
              cannot be undone — export your data first if you want a copy.
            </span>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type={user.hasPassword ? "password" : "text"}
              className="text-input"
              style={{ flex: "1 1 240px", minWidth: 0 }}
              autoComplete={user.hasPassword ? "current-password" : "off"}
              placeholder={
                user.hasPassword
                  ? "Enter your password to confirm"
                  : `Type ${user.email} to confirm`
              }
              value={reauthValue}
              onChange={(e) => setReauthValue(e.target.value)}
              disabled={deletingAccount}
            />
            <button
              className="btn danger"
              onClick={() => void deleteAccount()}
              disabled={!reauthOk || deletingAccount}
            >
              {deletingAccount ? <Spinner size={13} /> : <Trash2 size={14} />} Delete permanently
            </button>
          </div>
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
