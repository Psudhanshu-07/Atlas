import { useState, type ComponentType } from "react";
import { GithubMark } from "../ui";
import { Database, ShieldCheck, Sparkles, User } from "lucide-react";
import type { SessionUser } from "../../../../shared/types";
import { GeneralSection } from "../settings/GeneralSection";
import { AccountSection } from "../settings/AccountSection";
import { GithubSection } from "../settings/GithubSection";
import { AiSection } from "../settings/AiSection";
import { DataSection } from "../settings/DataSection";

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
          {section === "data" && <DataSection user={user} onShowToast={onShowToast} onSignOut={onSignOut} />}
        </div>
      </div>
    </div>
  );
}
