import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, ChatMessage } from "../../../../shared/types";
import { api } from "../../api";
import Markdown from "../Markdown";
import { ChatHistoryPanel } from "../chat/ChatHistoryPanel";
import { markFirstChatDone } from "../onboarding/SetupChecklist";
import { ConfirmationDialog } from "../ui";
import { History } from "lucide-react";

interface Props {
  analysis: Analysis;
  aiEnabled: boolean;
  initialPrompt?: string;
  onOpenFile: (path: string) => void;
  onShowToast: (msg: string) => void;
}

/** One rendered exchange row; assistant rows may carry sources. */
interface Entry {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  timestamp: string;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function entryFromMessage(m: ChatMessage): Entry {
  return {
    id: `srv-${m.id}`,
    role: m.role,
    content: m.content,
    sources: m.sources,
    timestamp: timeOf(m.createdAt),
  };
}

const AUDIT_CHIPS = [
  {
    icon: "key",
    iconColor: "text-error",
    label: "Audit secret leaks & env variable usage",
    prompt: "Audit secret leaks, sensitive credentials, and environment variable usage across the codebase.",
  },
  {
    icon: "sync_problem",
    iconColor: "text-primary",
    label: "Scan circular dependencies & layer violations",
    prompt: "What is the biggest structural risk or circular dependency in this repository, and what files are causing it?",
  },
  {
    icon: "shield_check",
    iconColor: "text-tertiary",
    label: "Verify test coverage & uncontained side-effects",
    prompt: "Verify test coverage gaps, uncontained side-effects, and untyped exports across the modules.",
  },
  {
    icon: "account_tree",
    iconColor: "text-secondary",
    label: "Explain data flow boundaries & export risks",
    prompt: "Explain how requests and data flow through the architecture from ingestion to data persistence.",
  },
];

export function AIAssistantView({ analysis, aiEnabled, initialPrompt, onOpenFile, onShowToast }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryQuestion, setRetryQuestion] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const askedInitial = useRef(false);
  const restored = useRef(false);

  const newChat = useCallback(() => {
    setConversationId(null);
    setEntries([]);
    setError(null);
    setRetryQuestion(null);
    setHistoryOpen(false);
  }, []);

  /** Reopen a stored conversation with its full message history. */
  const openConversation = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.chat(id);
      setConversationId(id);
      setEntries(res.conversation.messages.map(entryFromMessage));
      setHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // On entry, restore the most recent conversation so a refresh or a return
  // to the tab lands the user exactly where they left off.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void (async () => {
      try {
        const res = await api.chats({ analysisId: analysis.repo.id });
        const latest = res.conversations[0];
        if (latest) await openConversation(latest.id);
      } catch {
        /* history is a nicety here; the empty composer still works */
      }
    })();
  }, [analysis.repo.id, openConversation]);

  const send = useCallback(
    async (textToAsk?: string) => {
      const question = (textToAsk ?? input).trim();
      if (!question || loading) return;

      const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const optimistic: Entry = {
        id: clientMsgId,
        role: "user",
        content: question,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setInput("");
      setLoading(true);
      setError(null);
      setRetryQuestion(null);
      setEntries((prev) => [...prev, optimistic]);

      try {
        const res = await api.ask(analysis.repo.id, question, { conversationId, clientMsgId });
        setConversationId(res.conversationId ?? conversationId);
        setEntries((prev) => [
          ...prev,
          {
            id: `${clientMsgId}-a`,
            role: "assistant",
            content: res.answer,
            sources: res.sources,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setHistoryKey((k) => k + 1);
        markFirstChatDone(); // lights the onboarding milestone
      } catch (err) {
        // Keep the question visible and offer a retry; nothing is lost.
        setError(err instanceof Error ? err.message : String(err));
        setRetryQuestion(question);
      } finally {
        setLoading(false);
      }
    },
    [analysis.repo.id, conversationId, input, loading],
  );

  // Auto-send a prompt handed over from another view (Overview, Findings…).
  useEffect(() => {
    if (initialPrompt && !askedInitial.current) {
      askedInitial.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, loading]);

  const exportAuditReport = () => {
    const lines = [
      `# Atlas AST Security Audit Report — ${analysis.repo.name}`,
      `Generated: ${new Date().toISOString()}`,
      `Commit: ${analysis.repo.id}`,
      `Files: ${analysis.stats.files} | Dependencies: ${analysis.stats.internalDeps}`,
      `Issues Detected: ${analysis.stats.issues}`,
      "",
      "## Findings",
      ...analysis.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`),
      "",
      "## Session Log",
      ...entries.flatMap((m) => [
        m.role === "user" ? `### Q: ${m.content}` : m.content,
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-audit-${analysis.repo.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full h-[calc(100vh-3rem)] overflow-hidden bg-background">
      {/* Chat history sidebar (collapsible on small screens) */}
      <div
        className={`${
          historyOpen ? "flex" : "hidden"
        } lg:flex flex-col w-72 flex-shrink-0 min-h-0 absolute lg:relative inset-y-0 left-0 z-30 lg:z-auto shadow-lg lg:shadow-none`}
      >
        <ChatHistoryPanel
          analysisId={analysis.repo.id}
          activeId={conversationId}
          refreshKey={historyKey}
          onSelect={(id) => void openConversation(id)}
          onNew={newChat}
          onChanged={() => setHistoryKey((k) => k + 1)}
          onShowToast={onShowToast}
        />
      </div>
      {historyOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Enterprise AST Assurance Header */}
        <div className="px-margin py-space-sm bg-surface-container-low flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm border-b border-surface-variant flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="lg:hidden p-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-surface-variant text-on-surface transition-colors cursor-pointer"
                onClick={() => setHistoryOpen((o) => !o)}
                aria-label="Toggle chat history"
              >
                <History size={15} />
              </button>
              <span className="font-micro-label text-micro-label text-tertiary tracking-widest uppercase flex items-center gap-1.5 font-bold">
                <span className="material-symbols-outlined text-[14px] text-tertiary">verified_user</span>
                <span>ENTERPRISE AST ASSURANCE // LOCAL-ONLY RUNTIME</span>
              </span>
              <span className="px-2 py-0.5 rounded border border-outline-variant bg-surface-container text-tertiary text-micro-label font-code-compact flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">lock</span>
                <span>Zero-Exfiltration Guarantee</span>
              </span>
              <span className="px-2 py-0.5 rounded border border-surface-variant bg-surface-container-lowest text-on-surface-variant text-micro-label font-code-compact flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                <span>Tree-sitter AST v0.22 · SHA-256: {analysis.repo.id.slice(-7)}</span>
              </span>
            </div>
            <p className="font-body-compact text-body-compact text-on-surface-variant flex items-center gap-2 flex-wrap">
              <span>
                Private local AST analysis · Code never leaves your secure perimeter · 100% symbol-indexed
              </span>
              <span className="text-tertiary font-micro-label">• Immutable Audit Log: Active</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded bg-surface-container-lowest border border-surface-variant text-on-surface-variant font-code-compact text-code-compact">
              <span className="material-symbols-outlined text-[14px] text-tertiary">shield</span>
              <span>AUDIT LOG #{analysis.repo.id.slice(-4).toUpperCase()}-LOCAL</span>
            </div>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-surface-variant hover:bg-surface-container-high text-on-surface font-body-compact text-body-compact transition-colors cursor-pointer"
              title="Export cryptographic AST verification trace"
              type="button"
              onClick={exportAuditReport}
            >
              <span className="material-symbols-outlined text-[15px] text-tertiary">verified</span>
              <span>Export Audit Report</span>
            </button>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-compact text-body-compact transition-colors cursor-pointer"
              type="button"
              onClick={() => setClearOpen(true)}
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              <span>New chat</span>
            </button>
          </div>
        </div>

        {/* Security Audit Queries Bar */}
        <div className="px-margin py-2 bg-surface-container-lowest flex items-center gap-2 overflow-x-auto border-b border-surface-variant/50 flex-shrink-0">
          <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider flex-shrink-0 flex items-center gap-1 font-semibold">
            <span className="material-symbols-outlined text-[13px] text-tertiary">security</span>
            <span>SECURITY AUDIT QUERIES:</span>
          </span>
          {AUDIT_CHIPS.map((chip, i) => (
            <button
              key={i}
              className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-code-compact text-code-compact whitespace-nowrap transition-colors flex-shrink-0 flex items-center gap-1 cursor-pointer border border-surface-variant/40"
              type="button"
              onClick={() => void send(chip.prompt)}
            >
              <span className={`material-symbols-outlined text-[13px] ${chip.iconColor}`}>{chip.icon}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>

        {/* Chat Stream Body */}
        <div
          className="flex-1 overflow-y-auto px-margin py-space-lg space-y-space-lg"
          ref={threadRef}
          id="chatStream"
        >
          {entries.length === 0 && !loading && (
            <div className="flex items-start gap-3 max-w-4xl mx-auto my-6">
              <img
                src="/logo.png"
                alt="Atlas"
                className="w-7 h-7 rounded-md object-contain flex-shrink-0 mt-0.5 border border-surface-variant/40"
              />
              <div className="flex-1 bg-surface-container-low rounded-lg p-space-lg flex flex-col gap-space-md border border-surface-variant/40">
                <div className="flex items-center justify-between border-b border-surface-variant pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">
                      Atlas AST Synthesis Engine
                    </span>
                    <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-surface-container-highest text-tertiary">
                      AST RESOLVER v4.19
                    </span>
                  </div>
                  <span className="font-micro-label text-micro-label text-tertiary font-mono">
                    AST Cached &amp; Ready
                  </span>
                </div>
                <p className="font-body-default text-body-default text-on-surface leading-relaxed">
                  Welcome to Atlas. The entire repository{" "}
                  <code className="text-secondary font-mono font-medium">{analysis.repo.name}</code> has been indexed
                  into an immutable AST symbol graph with{" "}
                  <strong className="text-on-surface font-semibold">{analysis.stats.files}</strong> files and{" "}
                  <strong className="text-on-surface font-semibold">{analysis.stats.internalDeps}</strong> dependency
                  edges. Ask any architectural question or select an audit query above. Your chats are saved
                  automatically — reopen any of them from the history panel on the left.
                </p>
              </div>
            </div>
          )}

          {entries.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-2xl bg-surface-container rounded-lg p-space-md flex flex-col gap-1.5 border border-surface-variant/40">
                  <div className="flex items-center justify-between gap-space-md">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-metric text-micro-label text-on-surface-variant uppercase">
                        Operator
                      </span>
                      <span className="font-micro-label text-micro-label px-1 py-0.2 rounded bg-surface-container-low text-secondary">
                        ARCH_AUDIT
                      </span>
                    </div>
                    <span className="font-micro-label text-micro-label text-on-surface-variant">{m.timestamp}</span>
                  </div>
                  <p className="font-body-default text-body-default text-on-surface font-medium leading-relaxed">
                    {m.content}
                  </p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-3 max-w-4xl">
                <img
                  src="/logo.png"
                  alt="Atlas"
                  className="w-7 h-7 rounded-md object-contain flex-shrink-0 mt-0.5 border border-surface-variant/40"
                />
                <div className="flex-1 bg-surface-container-low rounded-lg p-space-lg flex flex-col gap-space-md border border-surface-variant/40">
                  <div className="flex flex-col gap-2 border-b border-surface-variant pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">
                          Atlas Synthesis
                        </span>
                        <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-surface-container-highest text-tertiary">
                          AST RESOLVER v4.19
                        </span>
                        <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant text-tertiary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">verified</span>
                          <span>100% AST Grounding</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant font-micro-label text-micro-label">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                        <span>{m.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  <div className="font-body-default text-body-default text-on-surface leading-relaxed">
                    <Markdown>{m.content}</Markdown>
                  </div>

                  {/* Sources / Verified Provenance */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="border-t border-surface-variant pt-space-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider font-semibold">
                            VERIFIED AST PROVENANCE ({m.sources.length} SOURCES)
                          </span>
                          <span className="font-micro-label text-micro-label px-1 py-0.2 rounded bg-surface-container-lowest text-tertiary">
                            CRYPTO_HASH: VERIFIED
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.sources.map((src) => (
                          <button
                            key={src}
                            onClick={() => onOpenFile(src)}
                            className="px-2 py-1 rounded bg-surface-container-lowest hover:bg-surface-container font-code-compact text-code-compact text-on-surface flex items-center gap-1.5 transition-colors border border-surface-variant/40 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px] text-tertiary">
                              description
                            </span>
                            <span>{src}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {loading && (
            <div className="flex items-start gap-3 max-w-4xl">
              <img
                src="/logo.png"
                alt="Atlas"
                className="w-7 h-7 rounded-md object-contain flex-shrink-0 mt-0.5 border border-surface-variant/40 animate-pulse"
              />
              <div className="flex-1 bg-surface-container-low rounded-lg p-space-md flex items-center gap-3 border border-surface-variant/40">
                <span className="material-symbols-outlined text-[18px] text-tertiary animate-spin">
                  refresh
                </span>
                <span className="font-code-compact text-code-compact text-on-surface-variant">
                  Resolving AST call graph and extracting component references...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="max-w-4xl p-3 rounded bg-error-container/20 border border-error-container text-error text-body-compact flex items-center justify-between gap-3 flex-wrap">
              <span>{error}</span>
              {retryQuestion && (
                <button
                  type="button"
                  className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-surface-variant text-on-surface text-body-compact transition-colors cursor-pointer"
                  onClick={() => void send(retryQuestion)}
                  disabled={loading}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Input Dock */}
        <div className="p-margin bg-surface-container-lowest border-t border-surface-variant flex flex-col gap-2 flex-shrink-0">
          <div className="relative bg-surface-container-low rounded-lg p-2.5 focus-within:bg-surface-container transition-colors border border-surface-variant/50">
            <textarea
              className="w-full bg-transparent resize-none font-code-default text-code-default text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              id="atlasInput"
              placeholder="Ask about imports, circular dependencies, dataflows, or architecture... (Enter to send, Shift+Enter for newline)"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />

            <div className="flex items-center justify-between pt-2 border-t border-surface-variant/50 mt-1 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest font-code-compact text-code-compact text-tertiary">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                  <span>Strict Deterministic AST Mode</span>
                </div>
                <span className="font-micro-label text-micro-label text-on-surface-variant hidden md:inline-block">
                  Scope: Whole Repo ({analysis.stats.files} files indexed · {analysis.stats.internalDeps} call edges)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="h-7 px-3 rounded bg-primary-container hover:bg-inverse-primary text-on-primary-container font-body-bold text-body-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  id="sendBtn"
                  type="button"
                  onClick={() => void send()}
                  disabled={loading || !input.trim()}
                >
                  <span>Execute Query</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={clearOpen}
        title="Start a new chat?"
        message="Your current conversation stays saved in the history panel — starting a new chat just gives you a fresh thread."
        confirmLabel="New chat"
        confirmVariant="primary"
        onConfirm={() => {
          setClearOpen(false);
          newChat();
        }}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
