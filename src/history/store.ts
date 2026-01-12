
import { HistoryStore, ChatThread, ChatMessage } from "../types/history";
import type AiAssistantPlugin from "../main";
import { v4 as uuidv4 } from "uuid"; // We will need uuid, assume it's available or use a helper
// Obsidian doesn't bundle 'uuid' by default, might need a helper or polyfill.
// For now, I'll implement a simple UUID generator or check if I should install uuid.
// Spec says "id: string // uuid".
// I'll add a helper for now to avoid package issues in this step or I can use crypto.
// Since 'crypto' is available in Node/modern browsers.

export class HistoryService {
    private plugin: AiAssistantPlugin;
    private store: HistoryStore;

    constructor(plugin: AiAssistantPlugin, initialData?: Partial<HistoryStore>) {
        this.plugin = plugin;
        this.store = {
            version: 1,
            threads: initialData?.threads || {},
            noteIndex: initialData?.noteIndex || {},
            vaultThreadId: initialData?.vaultThreadId || uuidv4(),
        };

        // Ensure vault thread exists
        if (!this.store.threads[this.store.vaultThreadId]) {
            this.store.threads[this.store.vaultThreadId] = this.createThread("vault", "Global Vault Chat");
        }
    }

    getStore(): HistoryStore {
        return this.store;
    }

    getNoteThread(notePath: string): ChatThread {
        let threadId = this.store.noteIndex[notePath];
        if (!threadId || !this.store.threads[threadId]) {
            threadId = uuidv4();
            this.store.noteIndex[notePath] = threadId;
            this.store.threads[threadId] = this.createThread("note", "Note Chat", notePath);
            this.store.threads[threadId].id = threadId; // Ensure ID matches
        }
        return this.store.threads[threadId];
    }

    getVaultThread(): ChatThread {
        return this.store.threads[this.store.vaultThreadId];
    }

    updateThread(thread: ChatThread) {
        this.store.threads[thread.id] = thread;
        this.save();
    }

    async save() {
        // This assumes the plugin handles saving the 'history' part of the data.
        // Or we can save direct if we passed a save handler.
        // For now we just keep state. The generic plugin save will persist this.
        await this.plugin.saveData(this.plugin.settings); // Wait, this needs careful integration with main.ts
    }

    private createThread(scope: "note" | "vault", title: string, notePath?: string): ChatThread {
        return {
            id: uuidv4(),
            scope,
            notePath,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
    }

    addMessage(threadId: string, message: Pick<ChatMessage, "role" | "content">) {
        const thread = this.store.threads[threadId];
        if (!thread) return;

        const settings = this.plugin.settings;
        const provider = settings.activeProvider;
        const providerSettings = settings.providers[provider];

        const chatMessage: ChatMessage = {
            id: uuidv4(),
            role: message.role as "user" | "assistant" | "system",
            content: message.content,
            createdAt: Date.now(),
            providerSnapshot: {
                kind: provider as any,
                baseUrl: providerSettings.baseUrl || "",
                model: providerSettings.model || "",
                temperature: providerSettings.temperature || 0.7
            }
        };

        thread.messages.push(chatMessage);
        thread.updatedAt = Date.now();
        this.save();
    }

    clearThread(threadId: string) {
        const thread = this.store.threads[threadId];
        if (!thread) return;
        thread.messages = [];
        thread.updatedAt = Date.now();
        this.save();
    }

    clearVaultThread() {
        this.clearThread(this.store.vaultThreadId);
    }

    clearNoteThread(notePath: string) {
        const threadId = this.store.noteIndex[notePath];
        if (threadId) {
            this.clearThread(threadId);
        }
    }
}

// Simple uuid polyfill if needed, but I'll use crypto.randomUUID if available or import uuid.
// Node environment in Electron usually supports 'crypto'.
// But waiting for 'npm install uuid' might be safer if I use it.
// I'll update package.json to include uuid if it's not there, but for now I used 'uuid' import.
// Implementation note: I need to install uuid.
