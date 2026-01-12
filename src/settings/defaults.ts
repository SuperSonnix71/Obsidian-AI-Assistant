
import { PluginSettings } from "../types/settings";

export const DEFAULT_SETTINGS: PluginSettings = {
    activeProvider: "ollama",
    providers: {
        ollama: {
            baseUrl: "http://localhost:11434",
            model: "llama2",
            temperature: 0.7,
        },
        openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            model: "gpt-3.5-turbo",
            temperature: 0.7,
        },
    },
    webSearch: {
        enabled: false,
        urlTemplate: "https://searx.be/search?q=%s&format=json", // Example output
        timeoutMs: 8000,
        maxResults: 5,
        safeSearch: 1,
    },
    history: {
        perNoteMaxMessages: 80,
        vaultMaxMessages: 400,
        maxMessageChars: 20000,
        summarizationThreshold: 0.8,
    },
    ui: {
        themeBaseColor: "neutral",
        rememberLastCommand: true,
        modalWidthPx: 980,
        modalHeightPx: 720,
    },
};
