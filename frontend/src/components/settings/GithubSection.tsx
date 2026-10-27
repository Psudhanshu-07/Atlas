import { useState } from "react";
import { api } from "../../api";
import { ConfirmationDialog, GithubMark, Spinner } from "../ui";
import { Trash2 } from "lucide-react";
import type { SessionUser } from "../../../../shared/types";
import { Card } from "./SettingsCard";

export function GithubSection({
  user,
  onShowToast,
  onUserChanged,
}: {
  user: SessionUser;
  onShowToast: (msg: string) => void;
  onUserChanged: (user: SessionUser) => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectGithub();
      const me = await api.me();
      if (me.user) onUserChanged(me.user);
      onShowToast("GitHub repository access revoked.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not disconnect GitHub.");
    } finally {
      setDisconnecting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Card title="GitHub account" description="Identity and repository access for analysis.">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Connected account</label>
            <input
              className="text-input"
              value={user.githubLogin ? `@${user.githubLogin}` : "Not connected"}
              disabled
            />
          </div>
          <div className="form-group">
            <label className="form-label">Repository access</label>
            <input
              className="text-input"
              value={user.reposGranted ? "Granted" : "Not granted"}
              disabled
            />
            <span className="form-help-text">
              {user.reposGranted
                ? "CodeAtlas can list and analyze your repositories."
                : "Grant access to list private and organization repositories."}
            </span>
          </div>
        </div>

        <div className="settings-save-row">
          <a className="btn primary" href={api.githubOAuthUrl({ scopes: "repos" })}>
            <GithubMark size={14} /> {user.reposGranted ? "Reconnect repository access" : "Grant repository access"}
          </a>
          {user.reposGranted && (
            <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              {disconnecting ? <Spinner size={13} /> : <Trash2 size={13} />} Revoke access
            </button>
          )}
        </div>
      </Card>

      <ConfirmationDialog
        isOpen={confirmOpen}
        title="Revoke GitHub access"
        message="Repository access is removed and future analyses cannot fetch from GitHub. Your account and past analyses stay intact."
        confirmLabel="Revoke"
        confirmVariant="danger"
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
