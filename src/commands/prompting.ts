
import type { CommandSpec } from "../types/core";
import type { PromptEnvelope } from "../types/prompting";
import type { EditorContext, VaultSummaryCache } from "../editor/context";
import type { WebSearchResultBundle } from "../providers/types";

export function generateSearchQueryMessages(
    context: EditorContext | null,
    userPrompt?: string,
    scope?: "selection" | "note" | "vault"
): Array<{ role: "system" | "user", content: string }> {
    // For vault-scoped commands, don't include note context (they're independent)
    const includeNoteContext = scope !== "vault";

    return [
        {
            role: "system",
            content: "You are a Search Query Generator. Your task is to extract a single, concise web search query from the user's request and the provided context. \n\nOutput ONLY the raw query string. No quotes, no markdown, no explanations. \n\nIf the text asks for a summary, query for the main entity or topic. \nIf the text is a question, refine it for a search engine (e.g., 'who won battle of hastings' instead of 'who won it?')."
        },
        {
            role: "user",
            content: `User Prompt: ${userPrompt || "None"}\n\nSelected Text (Context):\n${includeNoteContext && context?.selection?.text ? context.selection.text.slice(0, 500) : "None"}\n\nFull Note Title:\n${includeNoteContext && context?.note?.title ? context.note?.title : "None"}`
        }
    ];
}

export async function buildPromptEnvelope(
    command: CommandSpec,
    context: EditorContext | null,
    userPrompt?: string,
    webSearchResults?: WebSearchResultBundle,
    vaultSummaryCache?: VaultSummaryCache
): Promise<PromptEnvelope> {
    // For vault-scoped commands, don't include note context (they're independent)
    const includeNoteContext = command.scope !== "vault";
    
    // For vault-scoped commands, include vault summary with note metadata
    // Uses cached summary with O(1) access, O(N log K) on cache miss
    const vaultSummary = command.scope === "vault" && vaultSummaryCache ? vaultSummaryCache.get() : null;

    return {
        command_id: command.id,
        note: includeNoteContext && context?.note ? context.note : null,
        selection: includeNoteContext && context?.selection ? context.selection : null,
        note_context: {
            full_text: command.scope === "note" && context ? context.fullText : null // Only send full text if scope requires it
        },
        user_prompt: userPrompt || null,
        constraints: {
            output_markdown: true,
        },
        web_search_results: webSearchResults ? { enabled: true, ...webSearchResults } : { enabled: false },
        vault_summary: vaultSummary
    };
}

export function createSystemMessage(): string {
    return `You are an assistant inside Obsidian.
Follow the user's command precisely.
If web_search_results are provided, use them as reference material. When citing sources, use standard Markdown links like [Source Title](URL) - do NOT use reference markers like [REF] tags.
If vault_summary is provided, use it to answer questions about the user's notes, find relevant documents by name/tags/frontmatter, and help with vault organization. When listing notes from the vault, format note paths as Obsidian wikilinks using [[path/to/note]] syntax so they become clickable. Include the created date when relevant.
Never claim you accessed anything not included in the note content, selection, chat history, vault_summary, or web_search_results.
Output must be valid Markdown unless the command requires another format.`;
}

export function createUserMessage(envelope: PromptEnvelope): string {
    return `<obsidian_command>
${JSON.stringify(envelope, null, 2)}
</obsidian_command>`;
}
