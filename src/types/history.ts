
import { CommandId, ProviderKind } from "./core";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
    id: string;               // uuid
    role: ChatRole;
    content: string;          // normalized plain text/markdown
    createdAt: number;        // epoch ms
    commandId?: CommandId;    // which command produced it
    notePath?: string;        // for note-scoped threads
    providerSnapshot: {
        kind: ProviderKind;
        baseUrl: string;
        model: string;
        temperature: number;
    };
    tokenEstimate?: number;   // heuristic, optional
    metadata?: Record<string, unknown>;
}

export interface ChatThread {
    id: string;               // uuid
    scope: "note" | "vault";
    notePath?: string;
    title: string;            // derived from first user message / note name
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}

export interface HistoryStore {
    version: 1;
    threads: Record<string, ChatThread>; // threadId -> thread
    noteIndex: Record<string, string>;   // notePath -> threadId (for 1:1 note chat)
    vaultThreadId: string;               // global chat thread
}
