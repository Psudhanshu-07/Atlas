import { useCallback, useEffect, useState } from "react";
import { api, type SessionInfo } from "../../api";
import { Badge, ConfirmationDialog, Spinner } from "../ui";
import { KeyRound, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { SessionUser } from "../../../../shared/types";
import { Card } from "./SettingsCard";

export function AccountSection({
  user,
  onShowToast,
  onSignOut,
}: {
  user: SessionUser;
  onShowToast: (msg: string) => void;
  onSignOut: () => void;
}) {
  const [currentPw, setCurrentPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsError(null);
    try {
      const res = await api.sessions();
      setSessions(res.sessions);
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const changePassword = async () => {
    if (nextPw.length < 8) {
      onShowToast("New password must be at least 8 characters.");
      return;
    }
    if (nextPw !== confirmPw) {
      onShowToast("New password and confirmation do not match.");
      return;
    }
    setSavingPw(true);
    try {
      await api.changePassword(currentPw, nextPw);
      setCurrentPw("");
      setNextPw("");
      setConfirmPw("");
      onShowToast("Password updated.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setSavingPw(false);
    }
  };

  const revokeOne = async (session: SessionInfo) => {
    setRevoking(true);
    try {
      await api.revokeSession(session.id);
      onShowToast("Session revoked.");
      await loadSessions();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not revoke the session.");
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  const revokeOthers = async () => {
    setRevoking(true);
    try {
      await api.revokeOtherSessions();
      onShowToast("Other sessions signed out.");
      await loadSessions();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not sign out other sessions.");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <Card title="Account" description="Your sign-in identity on this workspace.">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input className="text-input" value={user.email} disabled />
            <span className="form-help-text">
              {user.githubLogin
                ? "Supplied by GitHub; manage it in your GitHub profile."
                : "The address you sign in with."}
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Sign-in method</label>
            <input
              className="text-input"
              value={user.githubLogin ? `GitHub · @${user.githubLogin}` : "E-mail + password"}
              disabled
            />
            <span className="form-help-text">
              {user.isAdmin ? "You are the workspace admin." : "Contact the workspace admin for access changes."}
            </span>
          </div>
        </div>
        <div className="settings-badges">
          {user.isAdmin && <Badge variant="accent">Workspace admin</Badge>}
          <Badge variant="muted">{user.githubLogin ? "GitHub-linked" : "Atlas account"}</Badge>
        </div>
      </Card>

      {user.hasPassword && (
        <Card title="Password" description="Changing your password signs out other devices.">
          <div className="form-group">
            <label className="form-label" htmlFor="pw-current">
              Current password
            </label>
            <input
              id="pw-current"
              type="password"
              className="text-input"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="pw-next">
                New password
              </label>
              <input
                id="pw-next"
                type="password"
                className="text-input"
                value={nextPw}
                onChange={(e) => setNextPw(e.target.value)}
                autoComplete="new-password"
              />
              <span className="form-help-text">At least 8 characters.</span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pw-confirm">
                Confirm new password
              </label>
              <input
                id="pw-confirm"
                type="password"
                className="text-input"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="settings-save-row">
            <button
              className="btn primary"
              onClick={() => void changePassword()}
              disabled={savingPw || !currentPw || !nextPw}
            >
              {savingPw ? <Spinner size={13} /> : <KeyRound size={13} />} Update password
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Active sessions"
        description="Devices currently signed in to your account."
      >
        {sessionsError && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="form-help-error">{sessionsError}</span>
            <button className="btn ghost" onClick={() => void loadSessions()}>
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}
        {sessions === null && !sessionsError && (
          <div className="flex items-center gap-2 text-on-surface-variant text-body-compact">
            <Spinner size={14} /> Loading sessions…
          </div>
        )}
        {sessions && (
          <>
            <ul className="session-list" aria-label="Active sessions">
              {sessions.map((s) => (
                <li key={s.id} className="session-row">
                  <Users size={14} />
                  <span className="session-agent">
                    {s.userAgent || "Unknown device"}
                    {s.current && (
                      <span className="settings-segment active" style={{ marginLeft: 8 }}>
                        This device
                      </span>
                    )}
                  </span>
                  <span className="dim-text" style={{ fontSize: 11.5 }}>
                    Last seen {new Date(s.lastSeenAt).toLocaleString()}
                  </span>
                  {!s.current && (
                    <button
                      className="btn ghost"
                      onClick={() => setRevokeTarget(s)}
                      disabled={revoking}
                      aria-label="Sign out this session"
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="settings-save-row">
              <button className="btn ghost" onClick={onSignOut}>
                <LogOut size={13} /> Sign out
              </button>
              {sessions.some((s) => !s.current) && (
                <button className="btn danger" onClick={() => void revokeOthers()} disabled={revoking}>
                  {revoking ? <Spinner size={13} /> : <ShieldCheck size={13} />} Sign out all other sessions
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      <ConfirmationDialog
        isOpen={Boolean(revokeTarget)}
        title="Sign out this session"
        message="That device will be signed out immediately and must sign in again."
        confirmLabel="Sign out"
        confirmVariant="danger"
        onConfirm={() => revokeTarget && void revokeOne(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
