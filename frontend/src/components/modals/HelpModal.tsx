// In-app help: the FAQ + troubleshooting + support entry points live here so
// answers are one click from every screen instead of a detour to a README.
// Reporting `help_opened` when it opens gives one durable adoption signal.

import { useEffect } from "react";
import { X } from "lucide-react";
import { api } from "../../api";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is Atlas?",
    a: "Atlas maps a codebase for you: connect a GitHub repository, Atlas clones it, walks the dependency graph, clusters modules by role, and produces an explorable architecture map, insights, docs and a grounded AI chat over your code.",
  },
  {
    q: "How do I analyze my first repository?",
    a: "Go to \"Repositories\", connect your GitHub account (or paste a public repo like owner/name), then hit Analyze. Progress appears live; the finished map opens automatically and lives in History.",
  },
  {
    q: "What do the map views mean?",
    a: "Overview summarizes the repository. Architecture clusters files by responsibility; Dependencies shows what imports what; Insights reads long-range consistency across modules; Chat answers questions strictly from your code with sources.",
  },
  {
    q: "Is my code stored?",
    a: "The analysis (structure, modules, docs) is stored per-account; full file contents are re-read from your checkout. Only you (and the workspace admin, for platform operation) can see your analyses — every query is bound to your session.",
  },
  {
    q: "How do I remove my data?",
    a: "Settings → Data can download a full JSON export of your account, or permanently delete the account and everything it owns (after password re-confirmation).",
  },
  {
    q: "Who is the admin?",
    a: "The first account created on a server becomes its workspace admin and can set the AI provider and crawler rules in Settings → AI.",
  },
];

const TROUBLESHOOT = [
  {
    when: "\"Analysis failed\"",
    why: "The repository could not be fetched (private without access, typo, or a rate limit).",
    fix: "Retry from Repositories; for private repos, connect GitHub with the 'repos' scope.",
  },
  {
    when: "Chat replies \"AI is not configured\"",
    why: "The server has no AI provider key set.",
    fix: "The workspace admin sets it in Settings → AI (provider + key).",
  },
  {
    when: "Signed out unexpectedly",
    why: "Sessions expire after a period of inactivity or all-sessions revoke.",
    fix: "Just sign in again — analyses are safe.",
  },
  {
    when: "First request after a pause is slow",
    why: "The free Render instance sleeps after ~15 minutes of inactivity.",
    fix: "Wait ~30–60 s while it boots; this is hosting behavior, not an outage.",
  },
];

export function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    api.track("help_opened"); // fire-and-forget; failures are swallowed inside
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog shortcuts-dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Help and FAQ"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Help &amp; FAQ</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body help-body">
          <section aria-labelledby="help-faq-head">
            <h4 id="help-faq-head" className="help-head">Frequently asked</h4>
            <dl className="help-faq">
              {FAQ.map((item) => (
                <div key={item.q} className="help-faq-item">
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="help-trouble-head">
            <h4 id="help-trouble-head" className="help-head">Troubleshooting</h4>
            <ul className="help-trouble">
              {TROUBLESHOOT.map((t) => (
                <li key={t.when}>
                  <strong>{t.when}</strong> — {t.why} <em>Fix: {t.fix}</em>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="help-support-head">
            <h4 id="help-support-head" className="help-head">Contact &amp; support</h4>
            <p className="help-support">
              Anything broken or unclear? Report it on the project repository:{" "}
              <a
                href="https://github.com/Psudhanshu-07/Atlas"
                target="_blank"
                rel="noreferrer"
              >
                github.com/Psudhanshu-07/Atlas
              </a>{" "}
              — include what you did and what you saw. Operational details for the
              deployment live in the repository's <code>docs/OPERATIONS.md</code>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
