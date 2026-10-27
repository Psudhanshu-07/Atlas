// Atlas chat: the persisted Q&A contract between the server and the assistant UI.

/** The answer to one question asked about a workspace or repository. */
export interface AskAnswer {
  answer: string;
  sources: string[];
  mode: "ai" | "heuristic";
  /** The conversation this exchange was persisted under (ask endpoint). */
  conversationId?: number;
}

/** A persisted Atlas conversation, owned by one account. */
export interface ChatConversation {
  id: number;
  analysisId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One stored chat message (user prompt or Atlas response). */
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  mode?: "ai" | "heuristic";
  createdAt: string;
}
