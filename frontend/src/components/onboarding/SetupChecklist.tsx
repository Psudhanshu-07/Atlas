// Guided setup for the first minutes in the app. Steps with honest,
// live-checked state (server truth for the first two, a local flag for the
// chat milestone); hides itself once every step is complete, or forever after
// the user dismisses it. Shown on the Overview page only.

import { useState } from "react";
import { Circle, CircleCheck, Sparkles } from "lucide-react";
import { api } from "../../api";

const DISMISS_KEY = "codeatlas:onboard-dismissed";
const FIRST_CHAT_KEY = "codeatlas:first-chat";

/** Marks the "asked Atlas" milestone; called from the chat success path. */
export function markFirstChatDone(): void {
  try {
    localStorage.setItem(FIRST_CHAT_KEY, "1");
  } catch {
    // storage unavailable — the step just stays incomplete
  }
}

function localFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

interface Props {
  stats: { repositories: number; analyses: number };
  onGoTo: (view: "repositories" | "assistant") => void;
}

export function SetupChecklist({ stats, onGoTo }: Props) {
  const [dismissed, setDismissed] = useState(() => localFlag(DISMISS_KEY));

  if (dismissed) return null;

  const connected = stats.repositories > 0;
  const analyzed = stats.analyses > 0;
  const asked = localFlag(FIRST_CHAT_KEY);
  if (connected && analyzed && asked) return null;

  const steps = [
    {
      done: connected,
      label: "Connect a repository",
      hint: "Link your GitHub or paste a public repo to work on.",
    },
    {
      done: analyzed,
      label: "Run your first analysis",
      hint: "Atlas maps the architecture, modules and docs for you.",
    },
    {
      done: asked,
      label: "Ask Atlas a question",
      hint: "Open Ask Atlas and get an answer grounded in your code.",
    },
  ];

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // still hide for this session even if storage is unavailable
    }
    setDismissed(true);
    api.track("onboarding_dismissed");
  };

  return (
    <section className="setup-checklist" aria-label="Getting started">
      <div className="setup-checklist-head">
        <Sparkles size={16} aria-hidden="true" />
        <h2>Getting started</h2>
        <button className="setup-dismiss" type="button" onClick={dismiss} aria-label="Dismiss getting started">
          Dismiss
        </button>
      </div>
      <ol className="setup-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : ""}>
            {s.done ? <CircleCheck size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
            <div>
              <span className="setup-label">{s.label}</span>
              <span className="setup-hint">{s.hint}</span>
            </div>
          </li>
        ))}
      </ol>
      {!connected && (
        <button type="button" className="setup-cta" onClick={() => onGoTo("repositories")}>
          Connect your first repository →
        </button>
      )}
    </section>
  );
}
