
import { requestUrl } from "obsidian";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

export interface HttpClient {
    get(url: string, headers?: Record<string, string>): Promise<unknown>;
    post(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown>;
    stream(
        url: string,
        body: unknown,
        headers: Record<string, string>,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal
    ): Promise<void>;
}

export const httpClient: HttpClient = {
    async get(url: string, headers: Record<string, string> = {}) {
        // Non-streaming: use Obsidian requestUrl to bypass CORS
        const res = await requestUrl({
            url,
            method: "GET",
            headers: {
                "Accept": "application/json",
                ...headers,
            },
        });
        if (res.status >= 300) {
            throw new Error(`Request failed: ${res.status} ${res.text}`);
        }
        return res.json;
    },

    async post(url: string, body: unknown, headers: Record<string, string> = {}) {
        const res = await requestUrl({
            url,
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
        });
        if (res.status >= 300) {
            throw new Error(`Request failed: ${res.status} ${res.text}`);
        }
        return res.json;
    },

    async stream(
        url: string,
        body: unknown,
        headers: Record<string, string>,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal
    ): Promise<void> {
        // Streaming: Use Node http/https
        // Spec 25: "uses a Node-capable streaming transport for SSE/NDJSON streaming on desktop"

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const lib = parsedUrl.protocol === "https:" ? https : http;

            const opts: http.RequestOptions = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                },
            };

            const req = lib.request(parsedUrl, opts, (res) => {
                if (res.statusCode && res.statusCode >= 300) {
                    // Read body for error
                    let errBody = "";
                    res.on("data", c => errBody += c);
                    res.on("end", () => reject(new Error(`Stream failed: ${res.statusCode} ${errBody}`)));
                    return;
                }

                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    if (signal?.aborted) {
                        res.destroy(); // stop reading
                        return;
                    }
                    onChunk(chunk);
                });

                res.on("end", () => resolve());
                res.on("error", (err) => reject(err));
            });

            // Set a default timeout (e.g., 20s) to prevent hanging indefinitely
            req.setTimeout(20000, () => {
                req.destroy(new Error("Connection timed out"));
            });

            req.on("error", (err) => reject(err));

            req.write(JSON.stringify(body));
            req.end();

            if (signal) {
                signal.addEventListener("abort", () => {
                    req.destroy();
                    reject(new Error("Aborted"));
                });
            }
        });
    }
};
