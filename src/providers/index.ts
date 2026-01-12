
import { OllamaSettings, OpenAICompatibleSettings } from "../types/settings";
import { ProviderClient } from "./types";
import { OllamaClient } from "./ollama";
import { OpenAICompatibleClient } from "./openai_compatible";

export function createProviderClient(provider: string, settings: OllamaSettings | OpenAICompatibleSettings): ProviderClient {
    if (provider === "ollama") {
        const ollamaSettings = settings as OllamaSettings;
        return new OllamaClient(ollamaSettings.baseUrl);
    } else {
        const openaiSettings = settings as OpenAICompatibleSettings;
        return new OpenAICompatibleClient(openaiSettings.baseUrl, openaiSettings.apiKey);
    }
}
