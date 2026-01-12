
import { ChatThread, ChatMessage } from "../types/history";
import { PluginSettings } from "../types/settings";

/**
 * Prunes a thread based on retention rules:
 * 1. Hard cap by count (perNoteMaxMessages or vaultMaxMessages).
 * 2. Hard cap by size (maxMessageChars).
 * 
 * Spec 9.3:
 * - If note thread and n > perNoteMaxMessages, drop oldest messages until cap.
 * - If vault thread and n > vaultMaxMessages, drop oldest until cap.
 * - For each message, if content.length > maxMessageChars, truncate.
 */
export function pruneThread(thread: ChatThread, settings: PluginSettings["history"]): ChatThread {
    const maxMessages = thread.scope === "note"
        ? settings.perNoteMaxMessages
        : settings.vaultMaxMessages;

    let messages = [...thread.messages];

    // 1. Hard cap by count
    if (messages.length > maxMessages) {
        const removeCount = messages.length - maxMessages;
        messages = messages.slice(removeCount);
    }

    // 2. Hard cap by size
    messages = messages.map((msg) => truncateMessage(msg, settings.maxMessageChars));

    return {
        ...thread,
        messages,
        updatedAt: Date.now(),
    };
}

function truncateMessage(msg: ChatMessage, maxChars: number): ChatMessage {
    if (msg.content.length <= maxChars) {
        return msg;
    }

    const keepStart = 4000;
    const keepEnd = 2000;

    // If limit is too small, just substring. But spec says default 20000.
    // We'll follow the spec implementation logic:
    // "first 4,000 chars ... \n...\n ... last 2,000 chars"

    // Safety check if maxChars is wildly small, though spec default is huge.
    if (maxChars < (keepStart + keepEnd + 100)) {
        return { ...msg, content: msg.content.substring(0, maxChars) };
    }

    const start = msg.content.substring(0, keepStart);
    const end = msg.content.substring(msg.content.length - keepEnd);

    return {
        ...msg,
        content: `${start}\n\n... [truncated] ...\n\n${end}`,
    };
}
