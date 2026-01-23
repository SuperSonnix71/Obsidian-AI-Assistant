
import { ProviderClient, ModelInfo, ChatRequest, StreamEvent } from "./types";
import { httpClient } from "./transport/httpClient";
import { createSseParser } from "./transport/sseParser";

export class OpenAICompatibleClient implements ProviderClient {
    kind = "openai_compatible" as const;
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl: string, apiKey?: string) {
        // Strip trailing slash
        let url = baseUrl.replace(/\/+$/, "");
        // Strip trailing /v1 if present to avoid double segment (e.g. /v1/v1/chat/completions)
        // Since we blindly append /v1 later.
        // NOTE: Some providers MIGHT need /v1/something but standard is host/v1/chat.
        // If the user inputs http://host/v1, we want http://host.
        if (url.endsWith("/v1")) {
            url = url.substring(0, url.length - 3);
        }
        this.baseUrl = url;
        this.apiKey = apiKey || "";
    }

    private getHeaders() {
        const headers: Record<string, string> = {
            "Authorization": `Bearer ${this.apiKey}`
        };
        return headers;
    }

    async listModels(): Promise<ModelInfo[]> {
        // Spec 6.3.1: GET /v1/models
        const url = `${this.baseUrl}/v1/models`;
        try {
            const res = await httpClient.get(url, this.getHeaders());
            // Parse { data: [{ id: string }] }
            const data: Array<{ id: string }> = (res as { data?: Array<{ id: string }> }).data || [];
            return data.map((m) => ({
                id: m.id,
                label: m.id,
                details: m
            }));
        } catch (err) {
            console.warn("Failed to fetch models from openai compatible endpoint", err);
            return []; // empty list triggers manual entry fallback in UI logic
        }
    }

    async chat(
        req: ChatRequest,
        onEvent: (ev: StreamEvent) => void,
        abortSignal: AbortSignal
    ): Promise<{ content: string; raw?: unknown }> {
        // Spec 6.3.2: POST /v1/chat/completions
        const url = `${this.baseUrl}/v1/chat/completions`;

        const body = {
            model: req.model,
            temperature: req.temperature,
            stream: req.stream,
            messages: req.messages,
            // Note: Spec 7.3 says web snippets are injected into messages.
            // The req.messages passed here are already prepared by the caller (Prompting layer).
        };

        const headers = this.getHeaders();

        if (req.stream) {
            // Streaming: SSE
            const parser = createSseParser(onEvent);
            await httpClient.stream(url, body, headers, parser, abortSignal);
            return { content: "" };
        } else {
            // Non-streaming
            const res = await httpClient.post(url, body, headers);
            // Spec 6.3.4: choices[0].message.content
            const content = res.choices?.[0]?.message?.content || "";
            return { content, raw: res };
        }
    }
}
