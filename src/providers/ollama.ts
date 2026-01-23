
import { ProviderClient, ModelInfo, ChatRequest, StreamEvent } from "./types";
import { httpClient } from "./transport/httpClient";
import { createNdjsonParser } from "./transport/ndjsonParser";

export class OllamaClient implements ProviderClient {
    kind = "ollama" as const;
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, ""); // normalize
    }

    async listModels(): Promise<ModelInfo[]> {
        // Spec 6.2.1: GET /api/tags
        const url = `${this.baseUrl}/api/tags`;
        const res = await httpClient.get(url);
        // Parse models[].name
        const models: Array<{ name: string }> = (res as { models?: Array<{ name: string }> }).models || [];
        return models.map((m) => ({
            id: m.name,
            label: m.name,
            details: m
        }));
    }

    async chat(
        req: ChatRequest,
        onEvent: (ev: StreamEvent) => void,
        abortSignal: AbortSignal
    ): Promise<{ content: string; raw?: unknown }> {
        // Spec 6.2.2: POST /api/chat
        const url = `${this.baseUrl}/api/chat`;

        // Construct body
        const body = {
            model: req.model,
            messages: req.messages,
            stream: req.stream,
            options: {
                temperature: req.temperature,
            }
        };

        if (req.stream) {
            // Streaming: NDJSON
            const parser = createNdjsonParser(onEvent);
            await httpClient.stream(url, body, {}, parser, abortSignal);
            // Content is accumulated via onEvent token emissions in the UI/State machine.
            // The provider chat() promise resolves when stream is done.
            // We return empty content here because the consumer handles tokens.
            return { content: "" };
        } else {
            // Non-streaming
            const res = await httpClient.post(url, body) as { message?: { content?: string } };
            // Spec 6.2.4: take message.content
            const content = res.message?.content || "";
            return { content, raw: res };
        }
    }
}
