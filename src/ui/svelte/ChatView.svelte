<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import { MarkdownRenderer, Component } from "obsidian";
    import type AiAssistantPlugin from "../../main";
    import type { CommandId } from "../../types/core";

    export let plugin: AiAssistantPlugin;
    export let messages: Array<{
        role: "user" | "assistant";
        content: string;
        id?: string;
        context?: any;
    }> = [];
    export let currentResponse = "";
    export let status: string = "idle";
    export let userPrompt = "";
    export let activeCommandId: CommandId | null = null;

    const dispatch = createEventDispatcher();

    // Pass in the web search toggle from parent settings?
    // Or dispatch an event to toggle it in global settings?
    export let webSearchEnabled = false;
    export let searchStatus = ""; // New prop for granular status
    export let searchQueries: string[] = [];
    export let webSearchResults:
        | import("../../providers/types").WebSearchResultBundle
        | undefined = undefined;

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            // Allow sending if idle OR error (to retry)
            if (
                userPrompt.trim() &&
                (status === "idle" || status === "error")
            ) {
                dispatch("send");
            }
        }
    }

    function handleSend() {
        if (userPrompt.trim() && (status === "idle" || status === "error")) {
            dispatch("send");
        }
    }

    function toggleWebSearch() {
        dispatch("toggleWebSearch");
    }

    // Track which message actions were just performed (for checkmark feedback)
    let copiedMessageIndex: number | null = null;
    let replacedMessageIndex: number | null = null;
    let createdNoteIndex: number | null = null;

    function handleCopy(text: string, index: number) {
        navigator.clipboard.writeText(text);
        copiedMessageIndex = index;
        setTimeout(() => {
            copiedMessageIndex = null;
        }, 1500);
    }

    function handleReplace(context: any, text: string, index: number) {
        dispatch("replace", { context, text });
        replacedMessageIndex = index;
        setTimeout(() => {
            replacedMessageIndex = null;
        }, 1500);
    }

    function handleCreateNote(text: string, index: number) {
        dispatch("createNote", { content: text });
        createdNoteIndex = index;
        setTimeout(() => {
            createdNoteIndex = null;
        }, 1500);
    }

    // Strip <think>...</think> tags from AI responses (used by reasoning models)
    function stripThinkingTags(text: string): string {
        let cleaned = text;
        // Remove standard thinking blocks: <think>...</think>
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
        // Remove alternative format: <think>...<think> (some models use this)
        cleaned = cleaned.replace(/<think>[\s\S]*?<think>/gi, "");
        // Remove any remaining <think> or </think> tags
        cleaned = cleaned.replace(/<\/?think>/gi, "");
        // Remove incomplete thinking block at end (during streaming)
        cleaned = cleaned.replace(/<think[\s\S]*$/gi, "");
        return cleaned.trim();
    }

    // Fix placeholder "Source Title" links by looking up the URL in search results
    function cleanSourceTitleLinks(text: string): string {
        if (!webSearchResults?.results) return text;

        return text.replace(/\[Source Title\]\(([^)]+)\)/gi, (match, url) => {
            // Find the result with matching URL
            const result = webSearchResults!.results.find(
                (r) =>
                    r.url === url || url.includes(r.url) || r.url.includes(url),
            );
            if (result) {
                return `[${result.title}](${result.url})`;
            }
            // Try to extract domain as fallback title
            try {
                const domain = new URL(url).hostname.replace("www.", "");
                return `[${domain}](${url})`;
            } catch {
                return match; // Keep as-is if URL parsing fails
            }
        });
    }

    // Clean assistant message for display
    function cleanAssistantMessage(text: string): string {
        let cleaned = stripThinkingTags(text);
        cleaned = cleanSourceTitleLinks(cleaned);
        return cleaned;
    }

    // Reactive: clean currentResponse for display
    $: displayResponse = cleanAssistantMessage(currentResponse);

    // Helper to format/hide raw JSON prompts
    function formatMessageContent(content: string): string {
        if (content.trim().startsWith("<obsidian_command>")) {
            return null as any; // Trigger hiding in template
        }
        return content;
    }

    function markdown(node: HTMLElement, text: string) {
        if (!text) return;
        node.empty();
        const component = new Component();
        MarkdownRenderer.render(plugin.app, text, node, "", component);

        return {
            update(newText: string) {
                node.empty();
                MarkdownRenderer.render(
                    plugin.app,
                    newText,
                    node,
                    "",
                    component,
                );
            },
            destroy() {
                component.unload();
            },
        };
    }
</script>

<div class="h-full flex flex-col">
    <!-- Messages Area -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {#each messages as message, index}
            <!-- Hide raw JSON prompts from UI based on user feedback -->
            {#if !message.content.trim().startsWith("<obsidian_command>")}
                <div
                    class="flex w-full {message.role === 'user'
                        ? 'justify-end'
                        : 'justify-start'}"
                    transition:fade={{ duration: 150 }}
                >
                    <div
                        class="group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm {message.role ===
                        'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted/50 rounded-bl-sm'}"
                    >
                        <div
                            class="prose prose-sm prose-invert max-w-none break-words"
                        >
                            <div
                                class="markdown-preview select-text helper-render"
                                use:markdown={message.role === "assistant"
                                    ? cleanAssistantMessage(message.content)
                                    : message.content}
                            ></div>
                        </div>

                        {#if message.role === "assistant"}
                            <div
                                class="mt-2 pt-2 border-t border-border/50 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <button
                                    class="p-1.5 rounded-md hover:bg-background/20 transition-colors {copiedMessageIndex ===
                                    index
                                        ? 'text-primary'
                                        : 'text-muted-foreground hover:text-foreground'}"
                                    title={copiedMessageIndex === index
                                        ? "Copied!"
                                        : "Copy to clipboard"}
                                    on:click={() =>
                                        handleCopy(message.content, index)}
                                >
                                    {#if copiedMessageIndex === index}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            ><polyline
                                                points="20 6 9 17 4 12"
                                            /></svg
                                        >
                                    {:else}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            ><rect
                                                width="14"
                                                height="14"
                                                x="8"
                                                y="8"
                                                rx="2"
                                                ry="2"
                                            /><path
                                                d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                                {#if message.context?.selection}
                                    <button
                                        class="p-1.5 rounded-md hover:bg-background/20 transition-colors {replacedMessageIndex ===
                                        index
                                            ? 'text-primary'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        title={replacedMessageIndex === index
                                            ? "Replaced!"
                                            : "Replace selection with this text"}
                                        on:click={() =>
                                            handleReplace(
                                                message.context,
                                                message.content,
                                                index,
                                            )}
                                    >
                                        {#if replacedMessageIndex === index}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><polyline
                                                    points="20 6 9 17 4 12"
                                                /></svg
                                            >
                                        {:else}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><path
                                                    d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"
                                                /><polygon
                                                    points="18 2 22 6 12 16 8 16 8 12 18 2"
                                                /></svg
                                            >
                                        {/if}
                                    </button>
                                {/if}
                                {#if activeCommandId === "research_create_note"}
                                    <button
                                        class="p-1.5 rounded-md hover:bg-background/20 transition-colors {createdNoteIndex ===
                                        index
                                            ? 'text-primary'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        title={createdNoteIndex === index
                                            ? "Note created!"
                                            : "Create note from this response"}
                                        on:click={() =>
                                            handleCreateNote(
                                                message.content,
                                                index,
                                            )}
                                    >
                                        {#if createdNoteIndex === index}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><polyline
                                                    points="20 6 9 17 4 12"
                                                /></svg
                                            >
                                        {:else}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><path
                                                    d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                                                /><polyline
                                                    points="14 2 14 8 20 8"
                                                /><line
                                                    x1="12"
                                                    y1="18"
                                                    x2="12"
                                                    y2="12"
                                                /><line
                                                    x1="9"
                                                    y1="15"
                                                    x2="15"
                                                    y2="15"
                                                /></svg
                                            >
                                        {/if}
                                    </button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        {/each}

        {#if status === "searching" || (webSearchResults && webSearchResults.results.length > 0)}
            <div class="flex w-full justify-start" transition:fade>
                <div
                    class="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3 bg-muted/30 text-xs border border-border/40"
                >
                    <div class="flex items-center gap-2 mb-2">
                        {#if status === "searching"}
                            <svg
                                class="animate-spin h-3.5 w-3.5 text-primary"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            <span class="text-muted-foreground font-medium"
                                >{searchStatus || "Searching..."}</span
                            >
                        {:else}
                            <svg
                                class="h-3.5 w-3.5 text-primary"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                                ></path><polyline points="22 4 12 14.01 9 11.01"
                                ></polyline></svg
                            >
                            <span class="text-muted-foreground font-medium"
                                >Sources</span
                            >
                        {/if}
                    </div>

                    {#if searchQueries && searchQueries.length > 0}
                        <div class="flex flex-wrap gap-1.5 mb-3">
                            {#each searchQueries as query}
                                <div
                                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border border-border/50 text-[10px] text-muted-foreground"
                                >
                                    <svg
                                        class="w-3 h-3 opacity-50"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        ><circle cx="11" cy="11" r="8" /><path
                                            d="m21 21-4.3-4.3"
                                        /></svg
                                    >
                                    <span class="truncate max-w-[150px]"
                                        >{query}</span
                                    >
                                </div>
                            {/each}
                        </div>
                    {/if}

                    {#if webSearchResults && webSearchResults.results.length > 0}
                        <div class="space-y-2 pt-1">
                            <div class="flex flex-wrap gap-2">
                                {#each webSearchResults.results.slice(0, 5) as result}
                                    <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all no-underline group max-w-full shadow-sm"
                                    >
                                        <div
                                            class="shrink-0 text-muted-foreground/70 group-hover:text-primary transition-colors"
                                        >
                                            {#if result.url.includes("github.com")}
                                                <svg
                                                    class="w-3.5 h-3.5"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    ><path
                                                        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                                                    /></svg
                                                >
                                            {:else}
                                                <svg
                                                    class="w-3.5 h-3.5"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    ><circle
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                    /><line
                                                        x1="2"
                                                        y1="12"
                                                        x2="22"
                                                        y2="12"
                                                    /><path
                                                        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                                                    /></svg
                                                >
                                            {/if}
                                        </div>
                                        <span
                                            class="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors max-w-[150px]"
                                            >{result.title}</span
                                        >
                                    </a>
                                {/each}
                                {#if webSearchResults.results.length > 5}
                                    <span
                                        class="text-[10px] text-muted-foreground self-center px-1"
                                        >+{webSearchResults.results.length - 5} more</span
                                    >
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        {#if status === "streaming" || status === "sending"}
            <div class="flex w-full justify-start" transition:fade>
                <div
                    class="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-muted/50 text-sm"
                >
                    {#if displayResponse}
                        <div
                            class="prose prose-sm prose-invert max-w-none break-words"
                        >
                            <div
                                class="markdown-preview select-text helper-render"
                                use:markdown={displayResponse}
                            ></div>
                        </div>
                    {:else}
                        <div class="flex items-center gap-2 h-6">
                            <svg
                                class="animate-spin h-4 w-4 text-primary"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            <span class="text-muted-foreground text-xs"
                                >{status === "sending"
                                    ? "Preparing..."
                                    : "Generating..."}</span
                            >
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <!-- Input Area -->
    <div
        class="p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
        <div
            class="relative flex items-end gap-2 p-1.5 rounded-xl border border-input focus-within:ring-2 focus-within:ring-ring/20 bg-muted/30 transition-all duration-200"
        >
            <textarea
                bind:value={userPrompt}
                on:keydown={handleKeyDown}
                placeholder="Message AI..."
                rows="1"
                class="flex-1 min-h-[44px] max-h-32 resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none scrollbar-hide"
                disabled={status === "streaming"}
            />
            <button
                on:click={toggleWebSearch}
                class="relative mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-muted {webSearchEnabled
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground/50'}"
                title={webSearchEnabled
                    ? "Disable Web Search"
                    : "Enable Web Search"}
            >
                <div class="relative">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class={webSearchEnabled ? "opacity-20" : ""}
                        ><circle cx="12" cy="12" r="10" /><path
                            d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
                        /><path d="M2 12h20" /></svg
                    >

                    {#if webSearchEnabled}
                        <div
                            class="absolute inset-0 flex items-center justify-center"
                        >
                            <svg
                                class="w-4 h-4 text-primary"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    {/if}
                </div>
            </button>
            <button
                on:click={handleSend}
                disabled={!userPrompt.trim() || status === "streaming"}
                class="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-0 disabled:scale-95"
            >
                <!-- SVG Icon for Send -->
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="m22 2-7 20-4-9-9-4Z" /><path
                        d="M22 2 11 13"
                    /></svg
                >
            </button>
        </div>
        <div class="px-1 py-1 text-xs text-muted-foreground/50 text-center">
            Press Enter to send, Shift+Enter for new line
        </div>
    </div>
</div>

<style>
    textarea {
        field-sizing: content; /* Modern auto-resize */
    }
</style>
