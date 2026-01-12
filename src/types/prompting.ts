
import type { CommandId } from "./core";
import type { WebSearchResultBundle } from "../providers/types";

export interface PromptEnvelope {
    command_id: CommandId;
    note: { path: string; title: string } | null;
    selection?: {
        text: string;
        from: { line: number; ch: number };
        to: { line: number; ch: number };
    } | null;
    note_context?: {
        full_text: string | null; // required for full_note_discussion if enabled
    };
    user_prompt?: string | null; // used by summarize_selection (custom prompt)
    constraints: {
        output_markdown: boolean;
        max_length_chars?: number;
    };
    web_search_results?: ({ enabled: false } | ({ enabled: true } & WebSearchResultBundle));
}
