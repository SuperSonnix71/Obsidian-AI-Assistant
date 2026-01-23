

export interface ModelInfo {
    id: string;      // canonical id/name
    label: string;   // display
    details?: Record<string, unknown>;
}

export interface ChatRequest {
    model: string;
    temperature: number;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;

    // Web grounding payload (client-side executed)
    webSearch?: {
        enabled: boolean;
        results?: WebSearchResultBundle;
    };

    stream: boolean;
}

export interface WebSearchResultItem {
    title: string;
    url: string;
    content: string; // snippet
    engine?: string;
    score?: number;
}

export interface WebSearchResultBundle {
    query: string;
    results: WebSearchResultItem[];
}

export type StreamEvent =
    | { type: "token"; value: string }
    | { type: "done" }
    | { type: "error"; message: string; retryable: boolean };

export interface ProviderClient {
    kind: "ollama" | "openai_compatible";

    listModels(): Promise<ModelInfo[]>;

    // Returns final assistant text; streaming emits token events.
    chat(
        req: ChatRequest,
        onEvent: (ev: StreamEvent) => void,
        abortSignal: AbortSignal
    ): Promise<{ content: string; raw?: unknown }>;
}
