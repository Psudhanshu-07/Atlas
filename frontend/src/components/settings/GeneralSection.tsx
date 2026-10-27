import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Spinner } from "../ui";
import { Check, ImagePlus, Monitor, Moon, Trash2, User } from "lucide-react";
import type { SessionUser } from "../../../../shared/types";
import { Card } from "./SettingsCard";

const MAX_BIO = 280;

export function GeneralSection({
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
