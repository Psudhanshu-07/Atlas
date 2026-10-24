import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { api, type ConfigResponse, type SessionInfo } from "../../api";
import { Badge, ConfirmationDialog, GithubMark, Spinner } from "../ui";
import {
  Check,
  Download,
  ImagePlus,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  Database,
  RefreshCw,
} from "lucide-react";
import type { SessionUser } from "../../../../shared/types";

interface Props {
  user: SessionUser | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onShowToast: (msg: string) => void;
  onUserChanged: (user: SessionUser) => void;
  onSignOut: () => void;
}

type SectionId = "general" | "account" | "github" | "ai" | "data";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: "general",
    label: "General",
    icon: User,
    description: "Profile photo, display name, role and bio.",
  },
  {
    id: "account",
    label: "Account & Security",
    icon: ShieldCheck,
    description: "Password, active sessions and sign-out.",
  },
  {
    id: "github",
    label: "GitHub & Integrations",
    icon: GithubMark,
    description: "Connected account and repository access.",
  },
  {
    id: "ai",
    label: "Atlas AI",
    icon: Sparkles,
    description: "AI engine status and workspace configuration.",
  },
  {
    id: "data",
    label: "Data & Privacy",
    icon: Database,
    description: "Chat history export and deletion.",
  },
];

const MAX_BIO = 280;

export function SettingsView({
  user,
  theme,
  onToggleTheme,
  onShowToast,
  onUserChanged,
  onSignOut,
}: Props) {
  const [section, setSection] = useState<SectionId>("general");

  if (!user) return null;
  return (
    <div className="settings-page settings-view">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-sub">
          Manage your profile, security, integrations and workspace data.
        </p>
      </div>

      <div className="settings-layout">
        {/* Sticky section nav */}
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item${section === s.id ? " active" : ""}`}
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content column */}
        <div className="settings-content">
          {section === "general" && (
            <GeneralSection
              user={user}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onShowToast={onShowToast}
              onUserChanged={onUserChanged}
            />
          )}
          {section === "account" && (
            <AccountSection user={user} onShowToast={onShowToast} onSignOut={onSignOut} />
          )}
          {section === "github" && <GithubSection user={user} onShowToast={onShowToast} onUserChanged={onUserChanged} />}
          {section === "ai" && <AiSection user={user} onShowToast={onShowToast} />}
          {section === "data" && <DataSection onShowToast={onShowToast} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- card shell */

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div className="flex flex-col gap-0.5">
          <h3>{title}</h3>
          {description && <p className="settings-card-desc">{description}</p>}
        </div>
      </div>
      <div className="settings-form">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- general */

function GeneralSection({
  user,
  theme,
  onToggleTheme,
  onShowToast,
  onUserChanged,
}: {
  user: SessionUser;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onShowToast: (msg: string) => void;
  onUserChanged: (user: SessionUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user.name);
    setRole(user.role ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  const dirty =
    name.trim() !== user.name ||
    role.trim() !== (user.role ?? "") ||
    bio.trim() !== (user.bio ?? "");

  const saveProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onShowToast("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateProfile(trimmed, bio.trim(), role.trim());
      onUserChanged(res.user);
      onShowToast("Profile updated.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not update the profile.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onShowToast("Only PNG, JPEG or WebP images are accepted.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onShowToast("Image must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploadAvatar(file);
      onUserChanged(res.user);
      onShowToast("Photo updated.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      const res = await api.removeAvatar();
      onUserChanged(res.user);
      onShowToast("Photo removed.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setUploading(false);
    }
  };

  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <>
      <Card title="Profile" description="How you appear across the CodeAtlas workspace.">
        <div className="avatar-row">
          {uploading ? (
            <span className="account-avatar avatar-xl" aria-busy="true">
              <Spinner size={22} />
            </span>
          ) : user.avatarUrl ? (
            <img className="account-avatar avatar-xl" src={user.avatarUrl} alt={user.name} />
          ) : (
            <span className="account-avatar avatar-xl" aria-hidden="true">
              {initials || <User size={30} />}
            </span>
          )}
          <div className="account-identity-text">
            <strong>{user.name}</strong>
            <span className="dim-text">{user.email}</span>
            <span className="dim-text">
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="settings-inline-row">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn ghost account-inline-btn" title="Upload a photo">
              <ImagePlus size={14} /> {user.avatarUrl ? "Change photo" : "Add photo"}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="settings-avatar-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
                disabled={uploading}
              />
            </label>
            {user.avatarUrl && !uploading && (
              <button
                type="button"
                className="btn ghost account-inline-btn"
                onClick={() => void removeAvatar()}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
          <span className="avatar-hint">PNG, JPEG or WebP · up to 2 MB.</span>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label" htmlFor="settings-name">
              Display name
            </label>
            <input
              id="settings-name"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-role">
              Role
            </label>
            <input
              id="settings-role"
              className="text-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={60}
              disabled={saving}
              placeholder="e.g. Senior Engineer, Architect, Tech Lead"
            />
            <span className="form-help-text">Shown under your name in the sidebar.</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="settings-bio">
            Bio
          </label>
          <textarea
            id="settings-bio"
            className="text-input settings-bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
            placeholder="A line or two about who you are and what you work on…"
            maxLength={MAX_BIO}
            disabled={saving}
          />
          <span className="form-help-text">
            {bio.length}/{MAX_BIO} characters
          </span>
        </div>

        <div className="settings-save-row">
          <button className="btn primary" onClick={() => void saveProfile()} disabled={saving || !dirty}>
            {saving ? <Spinner size={13} /> : <Check size={13} />} Save changes
          </button>
        </div>
      </Card>

      <Card title="Appearance" description="Theme follows this choice on every sign-in.">
        <div className="settings-inline-row">
          <div className="flex flex-col gap-0.5">
            <span className="form-label" style={{ marginBottom: 0 }}>
              Interface theme
            </span>
            <span className="form-help-text" style={{ marginTop: 0 }}>
              Stored on your account, restored after login.
            </span>
          </div>
          <div className="settings-segmented" role="group" aria-label="Interface theme">
            <button
              type="button"
              className={`settings-segment${theme === "dark" ? " active" : ""}`}
              onClick={() => theme === "light" && onToggleTheme()}
              aria-pressed={theme === "dark"}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              type="button"
              className={`settings-segment${theme === "light" ? " active" : ""}`}
              onClick={() => theme === "dark" && onToggleTheme()}
              aria-pressed={theme === "light"}
            >
              <Monitor size={14} /> Light
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- account */

function AccountSection({
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

/* --------------------------------------------------------------- github */

function GithubSection({
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

/* ------------------------------------------------------------------- ai */

function AiSection({ user, onShowToast }: { user: SessionUser; onShowToast: (msg: string) => void }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await api.updateConfig({
        model: config.model,
        ignorePatterns: config.ignorePatterns,
        maxDepth: config.maxDepth,
        ...(apiKeyInput ? { apiKey: apiKeyInput } : {}),
      });
      setConfig(updated);
      setApiKeyInput("");
      onShowToast("AI configuration saved.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not save the configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Card title="Atlas AI">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="form-help-error">{error}</span>
          <button className="btn ghost" onClick={() => void load()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card title="Atlas AI">
        <div className="flex items-center gap-2 text-on-surface-variant text-body-compact">
          <Spinner size={14} /> Loading AI configuration…
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title="Atlas AI" description="How Atlas answers questions about your code.">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Engine status</label>
            <input
              className="text-input"
              value={config.aiEnabled ? `Enabled · ${config.model}` : "Disabled (heuristic answers only)"}
              disabled
            />
          </div>
          <div className="form-group">
            <label className="form-label">Provider</label>
            <input className="text-input" value={config.provider} disabled />
          </div>
        </div>
        <p className="form-help-text">
          When the engine is off, Atlas answers from the deterministic analysis graph — no code ever
          leaves your machine in either mode unless a provider is configured.
        </p>
      </Card>

      {user.isAdmin ? (
        <Card
          title="Engine configuration"
          description="Workspace-wide settings, editable by the admin only."
        >
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="ai-model">
                Model
              </label>
              <input
                id="ai-model"
                className="text-input"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-key">
                API key
              </label>
              <input
                id="ai-key"
                className="text-input"
                type="password"
                value={apiKeyInput}
                placeholder={config.hasKey ? `Saved (${config.apiKey})` : "Not set"}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={saving}
                autoComplete="off"
              />
              <span className="form-help-text">
                Leave blank to keep the stored key. Never shown in full.
              </span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ai-ignore">
              Ignore patterns
            </label>
            <textarea
              id="ai-ignore"
              className="text-input settings-bio"
              rows={2}
              value={config.ignorePatterns}
              onChange={(e) => setConfig({ ...config, ignorePatterns: e.target.value })}
              disabled={saving}
            />
            <span className="form-help-text">One glob per line; matched files are skipped by the crawler.</span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ai-depth">
              Max crawl depth
            </label>
            <input
              id="ai-depth"
              className="text-input"
              type="number"
              min={1}
              max={64}
              value={config.maxDepth}
              onChange={(e) => setConfig({ ...config, maxDepth: Number(e.target.value) })}
              disabled={saving}
              style={{ maxWidth: 140 }}
            />
          </div>
          <div className="settings-save-row">
            <button className="btn primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner size={13} /> : <Check size={13} />} Save configuration
            </button>
          </div>
        </Card>
      ) : (
        <Card title="Engine configuration" description="Managed by the workspace admin.">
          <p className="form-help-text" style={{ marginTop: 0 }}>
            Only the workspace admin can change the AI engine configuration.
          </p>
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ data */

function DataSection({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exportChats = async () => {
    try {
      const res = await api.exportChats();
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
