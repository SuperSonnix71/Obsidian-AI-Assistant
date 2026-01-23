

export interface WebSearchSettings {
    enabled: boolean;
    urlTemplate: string;  // must include %s
    timeoutMs: number;    // default 8000
    maxResults: number;   // default 5
    safeSearch: 0 | 1 | 2; // if supported by engine
}

export interface OllamaSettings {
    baseUrl: string;
    model: string;
    temperature: number;
}

export interface OpenAICompatibleSettings {
    baseUrl: string;
    apiKey?: string;
    model: string;
    temperature: number;
}

export interface PluginSettings {
    activeProvider: string;
    providers: {
        [key: string]: OllamaSettings | OpenAICompatibleSettings;
        ollama: OllamaSettings;
        openai: OpenAICompatibleSettings;
    };
    webSearch: WebSearchSettings;

    // History retention
    history: {
        perNoteMaxMessages: number;     // default 80
        vaultMaxMessages: number;       // default 400
        maxMessageChars: number;        // default 20_000
        summarizationThreshold: number; // default 0.8 of max
    };

    ui: {
        themeBaseColor: "neutral"; // shadcn baseColor
        rememberLastCommand: boolean;
        modalWidthPx: number;      // default 980
        modalHeightPx: number;     // default 720
    };
}
