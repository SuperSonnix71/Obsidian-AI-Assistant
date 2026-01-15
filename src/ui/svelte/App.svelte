<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { slide } from "svelte/transition";
    import type AiAssistantPlugin from "../../main";
    import { COMMANDS } from "../../commands/registry";
    import { getEditorContext } from "../../editor/context";
    import {
        buildPromptEnvelope,
        createSystemMessage,
        createUserMessage,
        generateSearchQueryMessages,
    } from "../../commands/prompting";
    import { createProviderClient } from "../../providers/index";
    import type { WebSearchResultBundle } from "../../providers/types";
    import { applyToEditor } from "../../editor/apply";
    import { runSearxngSearch } from "../../websearch/searxng";
    import { CommandPickerModal } from "../commandPicker";
    import type { CommandId } from "../../types/core";
    import ChatView from "./ChatView.svelte";
    import SettingsDrawer from "./SettingsDrawer.svelte";

    export let plugin: AiAssistantPlugin;
    export let initialCommandId: string | undefined = undefined;

    // Export as const for external reference only
    export const onClose: () => void = () => {};
    let handleClose = onClose;

    let activeCommandId: CommandId | null =
        (initialCommandId as CommandId) || "note_chat";
    let status: "idle" | "sending" | "streaming" | "error" | "searching" =
        initialCommandId ? "sending" : "idle";

    $: if (initialCommandId) {
        handleCommandSelect(initialCommandId as CommandId);
        // Reset prop so we can re-trigger if needed, though usually this comes from parent calling set
        initialCommandId = undefined;
    }

    let messages: Array<{
        role: "user" | "assistant";
        content: string;
        id?: string;
        context?: any;
    }> = [];
    let currentResponse = "";
    let userPrompt = "";
    let error: string | null = null;
    let settingsOpen = false;
    let searchStatus = ""; // Granular status for UI spinner
    let searchQueries: string[] = []; // List of active search queries
    let webSearchResults: WebSearchResultBundle | undefined;
    let abortController: AbortController | null = null;
    let conversationSaved = false; // Checkmark feedback for save conversation button

    // Web Search state synced with plugin settings
    let webSearchEnabled = plugin.settings.webSearch.enabled;

    // Sync back from settings when drawer closes
    $: if (!settingsOpen) {
        webSearchEnabled = plugin.settings.webSearch.enabled;
    }

    function handleToggleWebSearch() {
        webSearchEnabled = !webSearchEnabled;
        plugin.settings.webSearch.enabled = webSearchEnabled;
        plugin.saveSettings();
    }

    $: activeCommand = COMMANDS.find((c) => c.id === activeCommandId);

    function loadHistory() {
        if (!activeCommandId) return;
        const command = COMMANDS.find((c) => c.id === activeCommandId);
        if (!command) return;

        if (command.scope === "note" || command.scope === "vault") {
            const context = getEditorContext(plugin.app);
            if (context) {
                let thread;
                if (command.scope === "note") {
                    thread = plugin.historyService.getNoteThread(
                        context.note.path,
                    );
                } else {
                    thread = plugin.historyService.getVaultThread();
                }
                messages = thread.messages
                    .filter(
                        (m: any) => m.role === "user" || m.role === "assistant",
                    )
                    .map((m: any) => ({ role: m.role, content: m.content })); // History doesn't have replacement context yet
            }
        } else {
            messages = [];
        }
    }

    async function runCommand() {
        if (status !== "sending") return;

        if (!activeCommandId) {
            error = "Please select a command from the menu above to get started.";
            status = "error";
            return;
        }

        const command = COMMANDS.find((c) => c.id === activeCommandId);
        if (!command) {
            error = "Command not found";
            status = "error";
            return;
        }

        // Validate provider configuration FIRST before doing anything else
        const activeProvider = plugin.settings.activeProvider;
        const providerConfig = plugin.settings.providers[activeProvider];

        if (!providerConfig) {
            error = `No configuration found for ${activeProvider}. Please configure it in settings.`;
            status = "error";
            return;
        }

        if (activeProvider === "ollama") {
            if (!providerConfig.baseUrl) {
                error =
                    "Ollama URL not configured. Please set the Ollama server URL in settings (e.g., http://localhost:11434).";
                status = "error";
                return;
            }
        } else {
            // OpenAI-compatible providers need an API key and base URL
            if (!providerConfig.apiKey) {
                error = `API key not configured for ${activeProvider}. Please add your API key in settings.`;
                status = "error";
                return;
            }
            if (!providerConfig.baseUrl) {
                error = `Base URL not configured for ${activeProvider}. Please set the API endpoint in settings.`;
                status = "error";
                return;
            }
        }

        if (!providerConfig.model) {
            error = `No model selected for ${activeProvider}. Please select a model in settings.`;
            status = "error";
            return;
        }

        let streamError: Error | null = null;

        try {
            status = "streaming";
            currentResponse = "";
            abortController = new AbortController();

            // Capture context immediately
            let context = getEditorContext(plugin.app);

            // Fix: If context is missing but we just clicked the command picker, try to recover the last active markdown leaf.
            // The sidebar might have stolen focus.
            if (!context && command.scope === "selection") {
                // If the command relies on selection, we MUST have a context.
                error = `"${command.title}" requires selected text. Please select some text in a note first.`;
                status = "error";
                return;
            }

            // Check if selection-based command actually has selected text
            if (
                context &&
                command.scope === "selection" &&
                (!context.selection || !context.selection.text.trim())
            ) {
                error = `"${command.title}" requires selected text. Please select some text in a note first.`;
                status = "error";
                return;
            }

            // CRITICAL: Restore selection visual highlight if we have a valid selection context
            // and the editor is not focused.
            // Actually, we can't easily force focus back without disrupting possible user workflow if they meant to switch.
            // But we can ensure we USE the selection.

            if (!context && command.scope === "note") {
                error = `"${command.title}" requires an open note. Please open a note first.`;
                status = "error";
                return;
            }

            // ---------------------------------------------------------
            // 1. Web Search Workflow (if enabled)
            // ---------------------------------------------------------
            if (webSearchEnabled) {
                // <--- Checked local var
                status = "searching";
                searchStatus = "Generating web search query...";
                searchQueries = []; // Reset queries
                webSearchResults = undefined; // Reset results

                try {
                    const providerSettings =
                        plugin.settings.providers[
                            plugin.settings.activeProvider
                        ];
                    const client = createProviderClient(
                        plugin.settings.activeProvider,
                        providerSettings,
                    );

                    const queryMessages = generateSearchQueryMessages(
                        context!,
                        userPrompt,
                        command.scope,
                    );

                    let refinedQuery = "";
                    const refineResponse = await client.chat(
                        {
                            messages: queryMessages,
                            model: providerSettings.model,
                            temperature: 0.1, // Strict factual
                            stream: false,
                        },
                        (event) => {
                            if (event.type === "token")
                                refinedQuery += event.value;
                        },
                        abortController!.signal,
                    );

                    // If stream=false, the client returns content directly and might NOT call the callback.
                    if (!refinedQuery && refineResponse.content) {
                        refinedQuery = refineResponse.content;
                    }

                    refinedQuery = refinedQuery
                        .trim()
                        .replace(/^["']|["']$/g, ""); // Remove quotes if LLM added them
                    console.log("Refined Search Query:", refinedQuery);

                    if (refinedQuery) {
                        searchQueries = [refinedQuery]; // Add to UI list
                        searchStatus = `Searching web...`;
                        try {
                            const results = await runSearxngSearch(
                                refinedQuery,
                                plugin.settings.webSearch,
                            );
                            webSearchResults = results;
                            searchStatus = `Found ${results.results.length} results.`;
                        } catch (sErr: any) {
                            console.error("SearXNG Search Failed:", sErr);
                            // Show non-blocking error in banner so user knows config is wrong
                            error = `Web Search Failed: ${sErr.message || "Unknown error"}`;
                            // Do not throw, allow chat to continue without search
                            searchStatus = "Web search failed. Continuing...";
                        }
                    } else {
                        searchStatus = "⚠️ Could not generate a search query.";
                    }
                } catch (e: any) {
                    console.warn(
                        "Search workflow failed, proceeding without search:",
                        e,
                    );
                    searchStatus = ""; // Clear status on hard fail so we proceed
                    if (e.name !== "AbortError") {
                        // Suppress toast, let main chat error handler catch connectivity issues if they persist
                    }
                }
            }

            status = "streaming";

            const envelope = await buildPromptEnvelope(
                command,
                context,
                userPrompt,
                webSearchResults,
            );
            const systemMsgContent = createSystemMessage();
            const userMsgContent = createUserMessage(envelope);

            let threadId: string | undefined;

            if (command.scope === "note" || command.scope === "vault") {
                let thread;
                if (command.scope === "note") {
                    thread = plugin.historyService.getNoteThread(
                        context!.note.path,
                    );
                } else {
                    thread = plugin.historyService.getVaultThread();
                }
                threadId = thread.id;
            }

            const messagesForAPI = [
                { role: "system" as const, content: systemMsgContent },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
                { role: "user" as const, content: userMsgContent },
            ];

            const providerSettings =
                plugin.settings.providers[plugin.settings.activeProvider];
            const client = createProviderClient(
                plugin.settings.activeProvider,
                providerSettings,
            );

            // Client.chat adaptation for streaming
            await client.chat(
                {
                    messages: messagesForAPI,
                    model: providerSettings.model,
                    temperature: providerSettings.temperature || 0.7,
                    stream: true,
                },
                (event) => {
                    if (event.type === "token") {
                        currentResponse += event.value;
                    } else if (event.type === "error") {
                        // Don't throw inside callback to avoid uncaught exceptions
                        streamError = new Error(event.message);
                        abortController?.abort();
                    }
                },
                abortController.signal,
            );

            if (streamError) {
                throw streamError;
            }

            // Add messages to UI state
            // For user message: If command was "Summarize selection", showing the JSON prompt is ugly.
            // We show the User's MANUAL prompt if it exists, or a placeholder if it was an automated command.
            // BUT: We must keep 'messages' array for history consistent.
            // The ChatView now filters out messages starting with <obsidian_command>

            const newMessageContext = context; // Capture closure value

            messages = [
                ...messages,
                { role: "user", content: userMsgContent },
                {
                    role: "assistant",
                    content: currentResponse,
                    context: newMessageContext,
                },
            ];

            status = "idle";
            userPrompt = "";

            if (threadId) {
                plugin.historyService.addMessage(threadId, {
                    role: "user",
                    content: userMsgContent,
                });
                plugin.historyService.addMessage(threadId, {
                    role: "assistant",
                    content: currentResponse,
                });
            }
        } catch (err: any) {
            console.error("RunCommand Error:", err);

            // Abort handling
            if (err.name === "AbortError" || err.message === "Aborted") {
                // If we aborted due to a stream error, process that error instead
                if (streamError) {
                    err = streamError;
                } else {
                    status = "idle";
                    return;
                }
            }

            // Ensure we don't show partial response
            currentResponse = "";

            let msg = err.message || "";
            // Append code if available (e.g. ECONNREFUSED) to ensure keyword matching works
            if (err.code) msg += ` ${err.code}`;

            if (!msg && typeof err === "string") msg = err;

            // Default fallback
            let friendlyMessage = "An unexpected error occurred.";

            // Parsing Logic
            const streamMatch = msg.match(/Stream failed: (\d+) ([\s\S]*)/);
            if (streamMatch) {
                const code = parseInt(streamMatch[1]);
                const body = streamMatch[2];
                let remoteMsg = "";

                try {
                    const jsonStart = body.indexOf("{");
                    if (jsonStart !== -1) {
                        const json = JSON.parse(body.substring(jsonStart));
                        remoteMsg = json.error?.message || json.message || "";
                    }
                } catch {
                    /* ignore */
                }

                // Map Status Codes
                switch (code) {
                    case 401:
                        friendlyMessage =
                            "Authentication failed. Please check your API key in settings.";
                        break;
                    case 403:
                        friendlyMessage =
                            "Access denied. Please check your API key and permissions.";
                        break;
                    case 404:
                        friendlyMessage =
                            "The selected model is unavailable or the provider endpoint is incorrect.";
                        break;
                    case 429:
                        friendlyMessage =
                            "Rate limit exceeded. Please wait a moment or check your usage quota.";
                        break;
                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        friendlyMessage =
                            "The AI provider is currently unavailable. Please try again later.";
                        break;
                    default:
                        // If specific text is present in the remote message, use that to refine
                        if (remoteMsg) {
                            if (remoteMsg.toLowerCase().includes("quota")) {
                                friendlyMessage =
                                    "You have exceeded your API quota.";
                            } else if (remoteMsg.length < 80) {
                                friendlyMessage = remoteMsg;
                            } else {
                                friendlyMessage = `Provider error (${code}). Check console for details.`;
                            }
                        } else {
                            friendlyMessage = `Connection failed (${code}).`;
                        }
                }
            } else {
                // Non-stream errors (Network, etc)
                // Normalize msg to lower case for easier matching
                const lowerMsg = msg.toLowerCase();

                if (
                    lowerMsg.includes("enotfound") ||
                    lowerMsg.includes("econnrefused") ||
                    lowerMsg.includes("err_name_not_resolved") ||
                    lowerMsg.includes("failed to fetch") ||
                    lowerMsg.includes("timed out") ||
                    lowerMsg.includes("fetch failed")
                ) {
                    if (plugin.settings.activeProvider === "ollama") {
                        friendlyMessage =
                            "Unable to connect to Ollama. Ensure it is running (usually localhost:11434).";
                    } else {
                        friendlyMessage =
                            "Network error. Please check your internet connection and API settings.";
                    }
                } else if (lowerMsg.includes("invalid url")) {
                    friendlyMessage =
                        "The provider URL is invalid. Please check your settings.";
                } else {
                    friendlyMessage =
                        msg.length < 100
                            ? msg
                            : "An error occurred while communicating with the AI provider.";
                }
            }

            error = friendlyMessage;
            status = "error";
        }
    }

    $: if (status === "sending") {
        runCommand();
    }

    function handleCommandSelect(commandId: CommandId) {
        const command = COMMANDS.find((c) => c.id === commandId);
        if (!command) return;

        activeCommandId = commandId;

        // Clear previous state when switching commands
        messages = [];
        currentResponse = "";
        error = null;
        searchQueries = [];
        webSearchResults = undefined;
        searchStatus = "";

        loadHistory(); // Load history for the selected command

        // Auto-run if Delivery implies immediate action or it's a specific generation task
        // "chat_only" usually waits for user input? NO, "Summarize selection" is chat_only but is a prompt.
        // Rule: If scope is 'selection', we run automatically.
        // Exception: "Explain selection" - runs auto. "Expand" - runs auto.
        // Chat modes ("note_chat", "vault_chat") wait for user.

        if (command.scope === "selection" || command.delivery !== "chat_only") {
            status = "sending";
        }
    }

    function handleSendMessage() {
        // Guard: Require a command to be selected
        if (!activeCommandId) {
            error = "Please select a command from the menu above to get started.";
            return;
        }

        // Clear previous error on new attempt
        if (status === "error") {
            error = null;
        }
        status = "sending";
    }

    function handleStopGeneration() {
        if (abortController) {
            abortController.abort();
        }
    }

    function handleReset() {
        messages = [];
        currentResponse = "";
        userPrompt = "";
        error = null;
        status = "idle";
        activeCommandId = null; // Also reset command on new chat
        searchQueries = [];
        webSearchResults = undefined;
    }

    function handleClearHistory() {
        // Clear persisted history based on current command scope
        const command = activeCommand;
        if (command) {
            if (command.scope === "vault") {
                plugin.historyService.clearVaultThread();
            } else if (command.scope === "note") {
                const context = getEditorContext(plugin.app);
                if (context?.note?.path) {
                    plugin.historyService.clearNoteThread(context.note.path);
                }
            }
        } else {
            // If no command selected, clear vault thread by default
            plugin.historyService.clearVaultThread();
        }
        // Also clear UI state
        handleReset();
    }

    // Handle replacement request from ChatView
    function handleReplace(event: CustomEvent) {
        const { context, text } = event.detail;
        // We need to re-locate the editor for the file in 'context.note.path'
        // For now, simpler: Use 'applyToEditor' if the active editor matches, or try to open it?
        // 'applyToEditor' takes an 'Editor' instance.
        // 'context' has 'note.path'.

        // Try to find an editor for this file
        const leaf = plugin.app.workspace
            .getLeavesOfType("markdown")
            .find(
                (leaf) => (leaf.view as any).file?.path === context.note.path,
            );

        if (leaf) {
            const view = leaf.view as any;
            // Ensure selection matches content from context if strict?
            // Or just replace the range stored in context.selection

            if (context.selection) {
                const editor = view.editor;
                // Check if selection is roughly valid?
                // Just do it.
                editor.replaceRange(
                    text,
                    context.selection.from,
                    context.selection.to,
                );
            } else {
                // Append if no selection? Or just insert at cursor
                // Warning: might duplicate if user moved cursor.
                const editor = view.editor;
                editor.replaceSelection(text);
            }
        } else {
            error = "Original note not open.";
        }
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
        return cleaned.trim();
    }

    function isObsidianCommandMessage(content: string): boolean {
        return content.trim().startsWith("<obsidian_command>");
    }

    // Remove [REF]...[/REF] markers and fix placeholder "Source Title" links
    function cleanReferenceMarkers(
        text: string,
        searchResults?: WebSearchResultBundle,
    ): string {
        let cleaned = text;

        // Try to resolve [REF]web_search_results.N[/REF] to actual URLs
        cleaned = cleaned.replace(
            /\[REF\]web_search_results\.(\d+)\[\/REF\]/gi,
            (match, index) => {
                const idx = parseInt(index, 10);
                if (searchResults?.results && searchResults.results[idx]) {
                    const result = searchResults.results[idx];
                    return `[${result.title}](${result.url})`;
                }
                return ""; // Remove unresolvable references
            },
        );

        // Fix placeholder "Source Title" links by looking up the URL in search results
        if (searchResults?.results) {
            cleaned = cleaned.replace(
                /\[Source Title\]\(([^)]+)\)/gi,
                (match, url) => {
                    // Find the result with matching URL
                    const result = searchResults.results.find(
                        (r) =>
                            r.url === url ||
                            url.includes(r.url) ||
                            r.url.includes(url),
                    );
                    if (result) {
                        return `[${result.title}](${result.url})`;
                    }
                    // Try to extract domain as fallback title
                    try {
                        const domain = new URL(url).hostname.replace(
                            "www.",
                            "",
                        );
                        return `[${domain}](${url})`;
                    } catch {
                        return match; // Keep as-is if URL parsing fails
                    }
                },
            );
        }

        return cleaned;
    }

    // Shared helper for creating research notes
    async function createResearchNote(
        rawContent: string,
        showSavedFeedback: boolean = false,
    ): Promise<void> {
        let cleanContent = stripThinkingTags(rawContent);

        // Remove common header prefixes that AI might add
        cleanContent = cleanContent
            .replace(/^##?\s*(Answer|Response|Reply):?\s*\n+/i, "")
            .replace(
                /^(Certainly!?|Sure!?|Of course!?|Here('s| is| are))[^\n]*\n+/i,
                "",
            )
            .replace(/^(Below is|Here's|The following)[^\n]*:\n+/i, "")
            .trim();

        // Extract the research title from H1 heading or user's research prompt
        let researchTitle = "";

        // First, try to match H1 at the very start of content
        let h1Match = cleanContent.match(/^#\s+([^\n]+)/);
        if (h1Match) {
            researchTitle = h1Match[1].trim();
            cleanContent = cleanContent.replace(/^#\s+[^\n]+\n*/, "").trim();
        } else {
            // Try to find the first H1 anywhere in the content (AI might have added preamble)
            h1Match = cleanContent.match(/^#\s+([^\n]+)/m);
            if (h1Match) {
                researchTitle = h1Match[1].trim();
                cleanContent = cleanContent.replace(/^#\s+[^\n]+\n*/m, "").trim();
            }
        }

        // If still no title, extract user_prompt from the first command message
        if (!researchTitle) {
            const firstCommandMsg = messages.find(
                (m) => m.role === "user" && isObsidianCommandMessage(m.content),
            );
            if (firstCommandMsg) {
                try {
                    const jsonMatch = firstCommandMsg.content.match(
                        /<obsidian_command>\s*([\s\S]*?)\s*<\/obsidian_command>/,
                    );
                    if (jsonMatch) {
                        const envelope = JSON.parse(jsonMatch[1]);
                        if (envelope.user_prompt) {
                            researchTitle = envelope.user_prompt
                                .split("\n")[0]
                                .slice(0, 80);
                        }
                    }
                } catch {
                    // JSON parse failed, ignore
                }
            }
        }

        // Sanitize title for use as filename
        let fileName = researchTitle
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 100);

        if (!fileName) {
            fileName = `Research ${new Date().toISOString().slice(0, 10)}`;
        }
        fileName += ".md";

        // Resolve reference markers to actual URLs
        cleanContent = cleanReferenceMarkers(cleanContent, webSearchResults);

        // Add creation date at the top (title is already used as filename)
        const date = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const finalContent = `*Created on ${date}*\n\n---\n\n${cleanContent}`;

        try {
            const existingFile =
                plugin.app.vault.getAbstractFileByPath(fileName);
            if (existingFile) {
                error = `A note named "${fileName}" already exists. Please choose a different name.`;
                return;
            }

            const newFile = await plugin.app.vault.create(
                fileName,
                finalContent,
            );

            if (showSavedFeedback) {
                conversationSaved = true;
                setTimeout(() => {
                    conversationSaved = false;
                }, 1500);
            }

            const leaf = plugin.app.workspace.getLeaf(false);
            await leaf.openFile(newFile);
        } catch (err: any) {
            console.error("Failed to create note:", err);
            error = `Failed to create note: ${err.message || "Unknown error"}`;
        }
    }

    // Handle create note request from ChatView (Research & Create Note command)
    async function handleCreateNote(event: CustomEvent) {
        const { content } = event.detail;
        await createResearchNote(content, false);
    }

    function openCommandPicker() {
        new CommandPickerModal(plugin, (commandId) => {
            handleCommandSelect(commandId);
        }).open();
    }

    // Save conversation as a note (uses last assistant message)
    async function handleSaveConversation() {
        if (messages.length === 0) return;

        const lastAssistantMsg = [...messages]
            .reverse()
            .find(
                (m) =>
                    m.role === "assistant" &&
                    !isObsidianCommandMessage(m.content),
            );

        if (!lastAssistantMsg) {
            error = "No assistant response found to save.";
            return;
        }

        await createResearchNote(lastAssistantMsg.content, true);
    }
</script>

<div
    class="h-full flex flex-col bg-background text-foreground relative overflow-hidden"
>
    <!-- Top Configuration Bar -->
    <div
        class="flex flex-col border-b border-border bg-background/95 backdrop-blur z-20"
    >
        <!-- Main Controls -->
        <div class="flex items-center gap-2 p-2">
            <button
                class="flex-1 inline-flex items-center justify-start gap-2 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium h-9 px-3 text-muted-foreground transition-colors text-left"
                on:click={openCommandPicker}
            >
                <span class="text-primary">✨</span>
                <span class="truncate block flex-1"
                    >{activeCommand
                        ? activeCommand.title
                        : "Pick a command..."}</span
                >
                <span class="text-xs opacity-50">▼</span>
            </button>

            <div class="flex items-center gap-1">
                {#if messages.length > 0 && activeCommandId === "research_create_note"}
                    <button
                        class="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-9 w-9 transition-colors {conversationSaved
                            ? 'text-primary'
                            : ''}"
                        on:click={handleSaveConversation}
                        title={conversationSaved
                            ? "Note created!"
                            : "Save conversation as note"}
                    >
                        {#if conversationSaved}
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
                                ><polyline points="20 6 9 17 4 12" /></svg
                            >
                        {:else}
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
                                ><path
                                    d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                                /><polyline points="14 2 14 8 20 8" /></svg
                            >
                        {/if}
                    </button>
                {/if}
                {#if messages.length > 0}
                    <button
                        class="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-9 w-9 transition-colors"
                        on:click={handleReset}
                        title="New Chat"
                    >
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
                            ><path d="M12 5v14" /><path d="M5 12h14" /></svg
                        >
                    </button>
                    <button
                        class="inline-flex items-center justify-center rounded-md hover:bg-destructive/80 hover:text-destructive-foreground h-9 w-9 transition-colors text-muted-foreground"
                        on:click={handleClearHistory}
                        title="Clear History"
                    >
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
                            ><path d="M3 6h18" /><path
                                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                            /><path
                                d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                            /><line x1="10" y1="11" x2="10" y2="17" /><line
                                x1="14"
                                y1="11"
                                x2="14"
                                y2="17"
                            /></svg
                        >
                    </button>
                {/if}
                <button
                    class="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-9 w-9 transition-colors"
                    on:click={() => (settingsOpen = true)}
                    title="Settings"
                >
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
                        ><path
                            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                        /><circle cx="12" cy="12" r="3" /></svg
                    >
                </button>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 overflow-hidden relative">
        {#if error}
            <div
                class="absolute top-4 left-4 right-4 z-50 p-3 rounded-md shadow-md flex justify-between gap-2 backdrop-blur-sm"
                style="background-color: var(--background-modifier-error); color: var(--text-on-accent); border: 1px solid var(--text-error);"
                transition:slide
            >
                <div class="flex-1 break-words font-medium">{error}</div>
                <button
                    class="rounded-md p-1 h-fit transition-colors hover:opacity-80"
                    on:click={() => (error = null)}
                    title="Dismiss"
                >
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
                        ><line x1="18" y1="6" x2="6" y2="18" /><line
                            x1="6"
                            y1="6"
                            x2="18"
                            y2="18"
                        /></svg
                    >
                </button>
            </div>
        {/if}

        <ChatView
            {plugin}
            {messages}
            {currentResponse}
            {status}
            bind:userPrompt
            {webSearchEnabled}
            {searchStatus}
            {searchQueries}
            {webSearchResults}
            {activeCommandId}
            on:send={handleSendMessage}
            on:replace={handleReplace}
            on:toggleWebSearch={handleToggleWebSearch}
            on:createNote={handleCreateNote}
        />

        <!-- Floating Stop Button -->
        {#if status === "streaming"}
            <div class="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
                <button
                    class="shadow-lg inline-flex items-center justify-center gap-2 rounded-full text-xs font-semibold bg-destructive/90 hover:bg-destructive text-destructive-foreground h-8 px-4 py-1 transition-all backdrop-blur"
                    on:click={handleStopGeneration}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            ry="2"
                        /></svg
                    >
                    Stop Generating
                </button>
            </div>
        {/if}
    </div>

    <!-- Settings Drawer -->
    <SettingsDrawer bind:open={settingsOpen} {plugin} />
</div>

<style>
    /* Scoped styles if needed */
</style>
