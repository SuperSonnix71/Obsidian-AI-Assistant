
export type ProviderKind = "ollama" | "openai_compatible";

export type CommandId =
    | "explain_selection"
    | "expand_selection"
    | "rewrite_selection_formal"
    | "rewrite_selection_casual"
    | "rewrite_selection_active_voice"
    | "rewrite_selection_bullets"
    | "caption_selection"
    | "summarize_selection"
    | "note_chat"
    | "vault_chat"
    | "research_create_note";

export type DeliveryMode =
    | "chat_only"                 // response only in chat pane
    | "replace_selection"         // replace current selection
    | "insert_below_selection"    // insert after selection with spacing
    | "append_to_note"            // append to end of note
    | "insert_at_cursor";         // insert at cursor

export interface CommandSpec {
    id: CommandId;
    title: string;
    scope: "selection" | "note" | "vault";
    delivery: DeliveryMode;
    allowStreaming: boolean;
    allowWebSearch: boolean;
    temperatureOverride?: number; // optional per-command default
}
