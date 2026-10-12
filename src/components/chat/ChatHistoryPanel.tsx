// Chat history sidebar for the Atlas assistant.
//
// Lists the signed-in user's conversations for the current repository,
// most recently updated first, with search (title + message content),
// inline rename, and delete behind a confirmation dialog. All data comes
// from the owner-scoped /api/chats endpoints; this panel never filters
// client-side as a security measure.

import { useEffect, useRef, useState } from "react";
import type { ChatConversation } from "../../../shared/types";
import { api } from "../../api";
import { ConfirmationDialog, LoadingSkeleton, SearchInput, timeAgo } from "../ui";
import { MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  analysisId: string;
  activeId: number | null;
  /** Bumped by the parent (e.g. after a send) to force a reload. */
  refreshKey?: number;
  onSelect: (conversationId: number) => void;
  onNew: () => void;
  /** Called after any mutation so the parent can refresh its own copy. */
  onChanged: () => void;
  onShowToast: (msg: string) => void;
}

export function ChatHistoryPanel({
  analysisId,
  activeId,
  refreshKey = 0,
  onSelect,
  onNew,
  onChanged,
  onShowToast,
}: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const renameInput = useRef<HTMLInputElement>(null);

  async function load(search = query) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.chats({ analysisId, query: search.trim() || undefined });
      setConversations(res.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Initial load + debounced search + parent-triggered refresh.
  useEffect(() => {
    const t = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, analysisId, refreshKey]);

  useEffect(() => {
    if (renamingId !== null) renameInput.current?.focus();
  }, [renamingId]);

  async function commitRename(conversationId: number) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    const previous = conversations;
    setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, title } : c)));
    try {
      await api.renameChat(conversationId, title);
      onChanged();
    } catch (err) {
      setConversations(previous);
      onShowToast(err instanceof Error ? err.message : "Could not rename the conversation.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteChat(deleteTarget.id);
      onShowToast("Conversation deleted.");
      if (deleteTarget.id === activeId) onNew();
      onChanged();
      await load();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not delete the conversation.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-low border-r border-surface-variant min-h-0">
      {/* Panel header */}
      <div className="p-3 border-b border-surface-variant flex-shrink-0">
        <button
          type="button"
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-surface-container hover:bg-surface-container-high border border-surface-variant text-on-surface font-body-compact text-body-compact transition-colors cursor-pointer"
        >
          <Plus size={14} />
          <span>New chat</span>
        </button>
        <div className="mt-2.5">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search chats…"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && conversations.length === 0 && (
          <div className="p-3">
            <LoadingSkeleton lines={5} height={34} />
          </div>
        )}

        {error && (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-body-compact text-error">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-container hover:bg-surface-container-high border border-surface-variant text-on-surface text-body-compact transition-colors cursor-pointer"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="p-4 flex flex-col items-center gap-2 text-center">
            <MessageSquare size={20} className="text-on-surface-variant" />
            <p className="text-body-compact text-on-surface-variant">
              {query ? "No conversations match your search." : "No chats yet. Ask Atlas anything to start one."}
            </p>
          </div>
        )}

        {!error && conversations.length > 0 && (
          <ul className="p-2 flex flex-col gap-0.5" aria-label="Chat history">
            {conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  {renamingId === c.id ? (
                    <input
                      ref={renameInput}
                      className="w-full px-2 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant text-on-surface text-body-compact focus:outline-none"
                      value={renameValue}
                      maxLength={120}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(c.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      aria-label="Conversation title"
                    />
                  ) : (
                    <div
                      className={`group flex items-center gap-1 rounded-md transition-colors ${
                        active
                          ? "bg-surface-container-high border border-surface-variant"
                          : "border border-transparent hover:bg-surface-container"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex-1 min-w-0 text-left px-2.5 py-2 cursor-pointer"
                        title={c.title}
                      >
                        <span className="block truncate text-body-compact text-on-surface">
                          {c.title}
                        </span>
                        <span className="block text-micro-label text-on-surface-variant mt-0.5">
                          {timeAgo(c.updatedAt)} · {c.messageCount}{" "}
                          {c.messageCount === 1 ? "message" : "messages"}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                          onClick={() => {
                            setRenamingId(c.id);
                            setRenameValue(c.title);
                          }}
                          aria-label={`Rename "${c.title}"`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                          onClick={() => setDeleteTarget(c)}
                          aria-label={`Delete "${c.title}"`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete conversation"
        message={`Delete “${deleteTarget?.title ?? ""}” and all of its messages? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      {deleting && null /* dialog stays up while the delete is in flight */}
    </div>
  );
}
