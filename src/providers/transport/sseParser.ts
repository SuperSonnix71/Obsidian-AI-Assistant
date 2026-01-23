
import { StreamEvent } from "../types";

// Type for OpenAI SSE streaming response
interface OpenAIStreamResponse {
    choices?: Array<{
        delta?: { content?: string };
    }>;
}

/**
 * Parses SSE stream (Server-Sent Events).
 * Spec 6.3.3:
 * - Split by \n\n (event boundary) or process line-by-line
 * - Check `data:` prefix
 * - `data: [DONE]` -> done
 */
export function createSseParser(onEvent: (ev: StreamEvent) => void) {
    let buffer = "";

    return (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        // Keep last possibly incomplete line
        // Note: SSE technically separates events by \n\n, but data lines are \n.
        // We'll process line by line for simplicity, handling multi-line data if needed (usually not for chat)
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === "[DONE]") {
                onEvent({ type: "done" });
                continue;
            }

            try {
                const data = JSON.parse(dataStr) as OpenAIStreamResponse;
                // OpenAI chunk format: choices[0].delta.content
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                    onEvent({ type: "token", value: delta });
                }
            } catch {
                // incomplete json or other event
            }
        }
    };
}
