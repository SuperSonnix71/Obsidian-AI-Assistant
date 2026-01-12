
import { CommandSpec } from "../types/core";

export const COMMANDS: readonly CommandSpec[] = [
    { id: "explain_selection", title: "Explain selection", scope: "selection", delivery: "chat_only", allowStreaming: true, allowWebSearch: true },
    { id: "expand_selection", title: "Expand selection", scope: "selection", delivery: "insert_below_selection", allowStreaming: true, allowWebSearch: true },
    { id: "rewrite_selection_formal", title: "Rewrite selection (Formal)", scope: "selection", delivery: "replace_selection", allowStreaming: true, allowWebSearch: false },
    { id: "rewrite_selection_casual", title: "Rewrite selection (Casual)", scope: "selection", delivery: "replace_selection", allowStreaming: true, allowWebSearch: false },
    { id: "rewrite_selection_active_voice", title: "Rewrite selection (Active voice)", scope: "selection", delivery: "replace_selection", allowStreaming: true, allowWebSearch: false },
    { id: "rewrite_selection_bullets", title: "Rewrite selection (Bullet points)", scope: "selection", delivery: "replace_selection", allowStreaming: true, allowWebSearch: false },
    { id: "caption_selection", title: "Caption selection", scope: "selection", delivery: "insert_below_selection", allowStreaming: true, allowWebSearch: true },
    { id: "summarize_selection", title: "Summarize selection", scope: "selection", delivery: "chat_only", allowStreaming: true, allowWebSearch: true },
    { id: "full_note_discussion", title: "Discuss full note", scope: "note", delivery: "chat_only", allowStreaming: true, allowWebSearch: true },
    { id: "note_chat", title: "Chat (this note)", scope: "note", delivery: "chat_only", allowStreaming: true, allowWebSearch: true },
    { id: "vault_chat", title: "Chat (vault)", scope: "vault", delivery: "chat_only", allowStreaming: true, allowWebSearch: true },
    { id: "research_create_note", title: "Research & Create Note", scope: "vault", delivery: "chat_only", allowStreaming: true, allowWebSearch: true }
] as const;
