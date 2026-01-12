
import { WebSearchSettings } from "../types/settings";
import { WebSearchResultBundle, WebSearchResultItem } from "../providers/types";
import { requestUrl } from "obsidian";

/**
 * Spec 7.1: SearXNG JSON API
 * Spec 7.2: Normalization
 */
export async function runSearxngSearch(
    query: string,
    settings: WebSearchSettings
): Promise<WebSearchResultBundle> {
    // Construct URL
    // Spec 7.1: urlTemplate must include %s
    const url = settings.urlTemplate.replace("%s", encodeURIComponent(query));

    try {
        const res = await requestUrl({
            url,
            method: "GET",
            // Spec 7.1: format=json implied in urlTemplate or params
            // user responsible for urlTemplate including format=json if they deviate from default
            headers: {
                "Accept": "application/json"
            }
        });

        if (res.status >= 300) {
            throw new Error(`Search failed: ${res.status}`);
        }

        const data = res.json;

        // Validate JSON structure (Spec 7.1 practical schema)
        if (!data.results || !Array.isArray(data.results)) {
            throw new Error("Invalid search response: missing results array");
        }

        // Spec 7.2: Take top default 5 (settings.maxResults)
        const rawResults = data.results.slice(0, settings.maxResults);

        const results: WebSearchResultItem[] = rawResults.map((item: any) => ({
            title: item.title || "No title",
            url: item.url || item.link || "", // 'link' is common in some APIs, 'url' in others. SearXNG uses 'url'.
            content: stripHtml(item.content || item.snippet || ""), // Spec 7.2: strip tags
            engine: item.engine,
            score: item.score
        }));

        return {
            query,
            results
        };

    } catch (err) {
        console.error("Web search error", err);
        // Return empty on error or throw? Spec doesn't strictly say, but UI should probably show error.
        // For now rethrow so UI state machine catches it.
        throw err;
    }
}

function stripHtml(html: string): string {
    // Basic stripping.
    // Spec 8.1 says "implement HTML parsing" for option B, but spec 2.3 recommends JSON only.
    // SearXNG JSON "content" might have bold tags like <b>query</b>.
    return html.replace(/<[^>]*>?/gm, "");
}
