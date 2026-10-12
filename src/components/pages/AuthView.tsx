import { useState } from "react";
import type { AuthProviders } from "../../state/useWorkspace";

interface Props {
  /** null until the server has answered, so we never flash the wrong state. */
  providers: AuthProviders | null;
  /** Server-supplied message (expired session, failed OAuth round-trip). */
  error: string | null;
  /** Create an account with e-mail + password; resolves to the signed-in user. */
  onRegister: (email: string, password: string, name?: string) => Promise<unknown>;
  /** Sign in to an existing e-mail + password account. */
  onSignIn: (email: string, password: string) => Promise<unknown>;
}

/** Collapsible setup notes for admins — hidden away so the screen stays simple. */
function GithubSetupHint() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <details className="text-left">
      <summary className="font-body-compact text-[12px] text-gray-500 cursor-pointer hover:text-gray-400 transition-colors">
        Having trouble? Enable GitHub sign-in
      </summary>
      <div className="mt-2 p-3 rounded border text-[12px] text-gray-400 space-y-1.5" style={{ backgroundColor: "#0D1117", borderColor: "#21262D" }}>
        <p>Create an OAuth app under GitHub &rarr; Settings &rarr; Developer settings, then set:</p>
        <code className="block p-1.5 rounded bg-black/40 border border-surface-variant text-[11px] font-mono text-secondary break-all">
          Callback: {origin}/api/auth/github/callback
        </code>
        <p>
          and add <code className="font-mono text-[11px] text-secondary">GITHUB_CLIENT_ID</code> /{" "}
          <code className="font-mono text-[11px] text-secondary">GITHUB_CLIENT_SECRET</code> to the server environment.
        </p>
      </div>
    </details>
  );
}

function GithubButton() {
  return (
    <a
      id="github-oauth-btn"
      href="/api/auth/github"
      className="w-full h-11 px-4 text-white rounded-lg flex items-center justify-center gap-3 font-semibold text-[14px] cursor-pointer transition-all duration-150 group shadow-sm hover:border-[#8b949e]"
      style={{ backgroundColor: "#21262d", border: "1px solid #363b42" }}
    >
      <svg
        aria-hidden="true"
        className="w-5 h-5 fill-current text-white group-hover:text-primary transition-colors"
        viewBox="0 0 16 16"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      <span>Continue with GitHub</span>
    </a>
  );
}

export function AuthView({ providers, error, onRegister, onSignIn }: Props) {
  const configured = providers?.github === true;
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setLocalError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await onRegister(email, password, name.trim() || undefined);
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const switchMode = (next: "signin" | "register") => {
    setMode(next);
    setLocalError(null);
  };

  const shownError = localError ?? error;

  const inputStyle = {
    backgroundColor: "#0D1117",
    border: "1px solid #30363D",
  } as const;

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-space-lg bg-background">
      <div
        className="flex flex-col w-full items-center justify-center min-h-screen py-12 px-4 selection:bg-primary-container selection:text-white"
        style={{ backgroundColor: "#0D1117" }}
      >
        {/* Auth Card Container */}
        <div
          className="w-full max-w-[420px] rounded-xl p-8 flex flex-col gap-6 shadow-2xl relative"
          style={{ backgroundColor: "#161B22", border: "1px solid #30363D" }}
        >
          {/* Brand & Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-md p-0.5"
              style={{ backgroundColor: "#0D1117", border: "1px solid #30363D" }}
            >
              <img
                src="/logo.png"
                alt="Atlas Spider-Cat Emblem"
                className="w-14 h-14 object-contain rounded-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-center gap-2">
                <h1 className="font-headline-lg text-[22px] font-semibold text-white tracking-tight">
                  Atlas
                </h1>
                <span
                  className="font-code-compact text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: "rgba(229,57,53,0.12)",
                    color: "#ff8a80",
                    border: "1px solid rgba(229,57,53,0.3)",
                  }}
                >
                  v2.4
                </span>
              </div>
              <p className="font-body-default text-[13px] text-gray-400 leading-normal">
                Codebase intelligence &amp; architecture analysis
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ backgroundColor: "#0D1117", border: "1px solid #21262D" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full inline-block animate-pulse"
                style={{ backgroundColor: "#3fb950" }}
              />
              <span className="font-micro-label text-[11px] text-gray-300 font-mono">
                ANALYSIS NODE READY
              </span>
            </div>
            <span className="font-code-compact text-[11px] font-mono text-gray-400">
              tree-sitter v0.22
            </span>
          </div>

          {/* Error notification if any */}
          {shownError && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-[12px] flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
              <span>{shownError}</span>
            </div>
          )}

          {/* Loading: wait for the providers probe before choosing what to show. */}
          {!providers ? (
            <div className="py-6 flex justify-center text-tertiary">
              <span className="material-symbols-outlined text-[24px] animate-spin">refresh</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* GitHub: one click when configured */}
              {configured && (
                <>
                  <GithubButton />
                  <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="flex-1 h-px" style={{ backgroundColor: "#30363D" }} />
                    <span className="font-micro-label text-[11px] text-gray-500 uppercase tracking-wider">
                      or
                    </span>
                    <span className="flex-1 h-px" style={{ backgroundColor: "#30363D" }} />
                  </div>
                </>
              )}

              {/* Mode switch */}
              <div
                className="flex p-1 rounded-lg gap-1"
                style={{ backgroundColor: "#0D1117", border: "1px solid #21262D" }}
              >
                {(
                  [
                    ["signin", "Sign in"],
                    ["register", "Create account"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchMode(value)}
                    className={`flex-1 h-9 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
                      mode === value ? "text-white" : "text-gray-400 hover:text-gray-200"
                    }`}
                    style={
                      mode === value
                        ? { backgroundColor: "#21262d", border: "1px solid #30363D" }
                        : { border: "1px solid transparent" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* E-mail + password form */}
              <form onSubmit={submit} className="flex flex-col gap-3">
                {mode === "register" && (
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="w-full h-11 px-3.5 rounded-lg text-[14px] text-white placeholder-gray-500 outline-none focus:border-[#8b949e] transition-colors"
                    style={inputStyle}
                  />
                )}
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full h-11 px-3.5 rounded-lg text-[14px] text-white placeholder-gray-500 outline-none focus:border-[#8b949e] transition-colors"
                  style={inputStyle}
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="w-full h-11 px-3.5 rounded-lg text-[14px] text-white placeholder-gray-500 outline-none focus:border-[#8b949e] transition-colors"
                  style={inputStyle}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 rounded-lg text-[14px] font-semibold text-white transition-all duration-150 cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: "#238636", border: "1px solid rgba(240,246,252,0.1)" }}
                >
                  {busy ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                  ) : mode === "register" ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              {!configured && <GithubSetupHint />}
            </div>
          )}

          {/* Trust & Permission Clarifications */}
          <div className="flex flex-col gap-2.5 pt-1 border-t" style={{ borderColor: "#21262D" }}>
            <div className="flex items-start gap-2.5 text-gray-300">
              <span
                className="material-symbols-outlined text-[16px] leading-tight text-gray-400 shrink-0 mt-0.5"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <p className="font-body-compact text-[12px] leading-snug text-gray-400">
                <strong className="text-gray-200 font-medium">Read-only access requested</strong> by default for repositories you authorize.
              </p>
            </div>
            <div className="flex items-start gap-2.5 text-gray-300">
              <span className="material-symbols-outlined text-[16px] leading-tight text-gray-400 shrink-0 mt-0.5">
                shield
              </span>
              <p className="font-body-compact text-[12px] leading-snug text-gray-400">
                <strong className="text-gray-200 font-medium">Zero source code retention</strong> — AST computations run securely in isolated memory.
              </p>
            </div>
            <div className="flex items-start gap-2.5 text-gray-300">
              <span className="material-symbols-outlined text-[16px] leading-tight text-gray-400 shrink-0 mt-0.5">
                lock
              </span>
              <p className="font-body-compact text-[12px] leading-snug text-gray-400">
                Fully local AST parsing &amp; dependency synthesis within your runtime boundary.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom Minimal Footer Links */}
        <div className="flex items-center gap-6 mt-8 font-mono text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#3fb950" }} />
            All systems operational
          </span>
          <span>·</span>
          <a href="#docs" className="hover:text-gray-300 transition-colors">
            Security Whitepaper
          </a>
          <span>·</span>
          <a href="#privacy" className="hover:text-gray-300 transition-colors">
            Privacy Boundary
          </a>
        </div>
      </div>
    </main>
  );
}

/** Shown while the session probe is in flight. */
export function AuthBoot() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1117] text-gray-400 font-mono text-[13px] gap-2">
      <span className="material-symbols-outlined text-[20px] animate-spin text-tertiary">refresh</span>
      <span>Probing Atlas session...</span>
    </div>
  );
}
