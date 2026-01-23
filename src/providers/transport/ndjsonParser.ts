
import { StreamEvent } from "../types";

// Type for Ollama NDJSON streaming response
interface OllamaStreamResponse {
    done?: boolean;
    message?: { content?: string };
    response?: string;
}

/**
 * Parses NDJSON stream (newline delimited JSON).
 * Spec 6.2.3:
 * - Maintain text buffer
 * - Split on \n
 * - JSON.parse(line)
 */
export function createNdjsonParser(onEvent: (ev: StreamEvent) => void) {
    let buffer = "";

    return (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        // Keep the last part in buffer if it's incomplete
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const data = JSON.parse(line) as OllamaStreamResponse;
                // Ollama: "response" field has token, "done" field is boolean
                if (data.done) {
                    onEvent({ type: "done" });
                    return;
                }
                if (data.message && data.message.content) {
                    onEvent({ type: "token", value: data.message.content });
                } else if (data.response) { // Legacy ollama or different endpoint
                    onEvent({ type: "token", value: data.response });
                }
            } catch (err) {
                console.error("NDJSON parse error", err, line);
                // We generally ignore parse errors for partial lines but here we expected full lines
            }
        }
    };
}
