<script lang="ts">
    import type AiAssistantPlugin from "../../main";
    import { createProviderClient } from "../../providers/index";
    import type { ModelInfo } from "../../providers/types";
    import { ModelPickerModal } from "../modelPicker";

    export let open = false;
    export let plugin: AiAssistantPlugin;

    let settings = plugin.settings;

    let availableModels: ModelInfo[] = [];
    let isFetching = false;
    let fetchError: string | null = null;

    function handleClose() {
        open = false;
    }

    async function openModelSelector(provider: "ollama" | "openai") {
        if (isFetching) return;
        await fetchModels(provider);

        if (availableModels.length > 0) {
            new ModelPickerModal(plugin.app, availableModels, (modelId) => {
                updateProviderSetting(provider, "model", modelId);
            }).open();
        }
    }

    async function updateSetting<K extends keyof typeof settings>(
        key: K,
        value: (typeof settings)[K],
    ) {
        if (key === "activeProvider" && value !== settings.activeProvider) {
            availableModels = [];
            fetchError = null;
        }
        settings[key] = value;
        await plugin.saveSettings();
    }

    async function updateProviderSetting(
        provider: string,
        key: string,
        value: any,
    ) {
        if (!settings.providers[provider]) {
            settings.providers[provider] = {};
        }
        settings.providers[provider][key] = value;
        await plugin.saveSettings();
    }

    async function fetchModels(provider: "ollama" | "openai") {
        isFetching = true;
        fetchError = null;
        availableModels = [];

        try {
            const providerSettings = settings.providers[provider];
            if (!providerSettings) {
                throw new Error("Provider settings not initialized");
            }
            // Ensure we have minimal config
            if (provider === "ollama" && !providerSettings.baseUrl) {
                providerSettings.baseUrl = "http://localhost:11434";
            }

            const client = createProviderClient(provider, providerSettings);
            availableModels = await client.listModels();

            if (availableModels.length === 0) {
                fetchError = "No models found or connection failed";
            }
        } catch (e: any) {
            fetchError = e.message || "Failed to fetch models";
        } finally {
            isFetching = false;
        }
    }
</script>

{#if open}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <div
        class="absolute inset-0 z-50 flex flex-col animate-in slide-in-from-right duration-200"
        style="background-color: var(--background-primary);"
        role="dialog"
        aria-modal="true"
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur z-10 shrink-0"
        >
            <h2
                class="text-sm font-bold uppercase tracking-wider text-muted-foreground"
            >
                Settings
            </h2>
            <button
                on:click={handleClose}
                class="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close"
            >
                <!-- Close Icon -->
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
                    ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
                >
            </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-8">
            <!-- Provider Section -->
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium">Provider</label>
                    <div
                        class="relative inline-flex h-8 w-[140px] items-center rounded-lg bg-muted p-1"
                    >
                        <button
                            class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all {settings.activeProvider ===
                            'ollama'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'}"
                            on:click={() =>
                                updateSetting("activeProvider", "ollama")}
                        >
                            Ollama
                        </button>
                        <button
                            class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all {settings.activeProvider ===
                            'openai'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'}"
                            on:click={() =>
                                updateSetting("activeProvider", "openai")}
                        >
                            OpenAI
                        </button>
                    </div>
                </div>

                <!-- Ollama Fields -->
                {#if settings.activeProvider === "ollama"}
                    <div
                        class="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                        <div class="space-y-1.5">
                            <label
                                class="text-xs font-medium text-muted-foreground"
                                >Base URL</label
                            >
                            <input
                                type="text"
                                value={settings.providers.ollama?.baseUrl || ""}
                                on:input={(e) =>
                                    updateProviderSetting(
                                        "ollama",
                                        "baseUrl",
                                        e.currentTarget.value,
                                    )}
                                class="flex w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                placeholder="http://localhost:11434"
                            />
                        </div>

                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                                <label
                                    class="text-xs font-medium text-muted-foreground"
                                    >Model Name</label
                                >
                            </div>

                            {#if fetchError && settings.activeProvider === "ollama"}
                                <div
                                    class="p-2 rounded bg-destructive/10 text-destructive text-[10px] mb-2 animate-in fade-in slide-in-from-top-1"
                                >
                                    Connection failed: {fetchError}
                                </div>
                            {/if}

                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    value={settings.providers.ollama?.model ||
                                        ""}
                                    on:input={(e) =>
                                        updateProviderSetting(
                                            "ollama",
                                            "model",
                                            e.currentTarget.value,
                                        )}
                                    class="flex-1 rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                    placeholder="llama2"
                                />
                                <button
                                    class="p-2 h-9 w-9 inline-flex items-center justify-center rounded-md border border-input hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                    title="Fetch and select model..."
                                    on:click={() => openModelSelector("ollama")}
                                    disabled={isFetching}
                                >
                                    {#if isFetching && settings.activeProvider === "ollama"}
                                        <div
                                            class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                        />
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
                                            ><line
                                                x1="8"
                                                y1="6"
                                                x2="21"
                                                y2="6"
                                            /><line
                                                x1="8"
                                                y1="12"
                                                x2="21"
                                                y2="12"
                                            /><line
                                                x1="8"
                                                y1="18"
                                                x2="21"
                                                y2="18"
                                            /><line
                                                x1="3"
                                                y1="6"
                                                x2="3.01"
                                                y2="6"
                                            /><line
                                                x1="3"
                                                y1="12"
                                                x2="3.01"
                                                y2="12"
                                            /><line
                                                x1="3"
                                                y1="18"
                                                x2="3.01"
                                                y2="18"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <div class="space-y-3 pt-2">
                            <div class="flex items-center justify-between">
                                <label
                                    class="text-xs font-medium text-muted-foreground"
                                    >Temperature</label
                                >
                                <span
                                    class="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded"
                                >
                                    {settings.providers.ollama?.temperature?.toFixed(
                                        1,
                                    ) || "0.7"}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={settings.providers.ollama?.temperature ||
                                    0.7}
                                on:input={(e) =>
                                    updateProviderSetting(
                                        "ollama",
                                        "temperature",
                                        parseFloat(e.currentTarget.value),
                                    )}
                                class="styled-slider"
                            />
                        </div>
                    </div>
                {/if}

                <!-- OpenAI Fields -->
                {#if settings.activeProvider === "openai"}
                    <div
                        class="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                        <div class="space-y-1.5">
                            <label
                                class="text-xs font-medium text-muted-foreground"
                                >API Key</label
                            >
                            <input
                                type="password"
                                value={settings.providers.openai?.apiKey || ""}
                                on:input={(e) =>
                                    updateProviderSetting(
                                        "openai",
                                        "apiKey",
                                        e.currentTarget.value,
                                    )}
                                class="flex w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                placeholder="sk-..."
                            />
                        </div>

                        <div class="space-y-1.5">
                            <label
                                class="text-xs font-medium text-muted-foreground"
                                >Base URL</label
                            >
                            <input
                                type="text"
                                value={settings.providers.openai?.baseUrl || ""}
                                on:input={(e) =>
                                    updateProviderSetting(
                                        "openai",
                                        "baseUrl",
                                        e.currentTarget.value,
                                    )}
                                class="flex w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                placeholder="https://api.openai.com/v1"
                            />
                        </div>

                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                                <label
                                    class="text-xs font-medium text-muted-foreground"
                                    >Model Name</label
                                >
                            </div>

                            {#if fetchError && settings.activeProvider === "openai"}
                                <div
                                    class="p-2 rounded bg-destructive/10 text-destructive text-[10px] mb-2 animate-in fade-in slide-in-from-top-1"
                                >
                                    Connection failed: {fetchError}
                                </div>
                            {/if}

                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    value={settings.providers.openai?.model ||
                                        ""}
                                    on:input={(e) =>
                                        updateProviderSetting(
                                            "openai",
                                            "model",
                                            e.currentTarget.value,
                                        )}
                                    class="flex-1 rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                    placeholder="gpt-4"
                                />
                                <button
                                    class="p-2 h-9 w-9 inline-flex items-center justify-center rounded-md border border-input hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                    title="Fetch and select model..."
                                    on:click={() => openModelSelector("openai")}
                                    disabled={isFetching}
                                >
                                    {#if isFetching && settings.activeProvider === "openai"}
                                        <div
                                            class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                        />
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
                                            ><line
                                                x1="8"
                                                y1="6"
                                                x2="21"
                                                y2="6"
                                            /><line
                                                x1="8"
                                                y1="12"
                                                x2="21"
                                                y2="12"
                                            /><line
                                                x1="8"
                                                y1="18"
                                                x2="21"
                                                y2="18"
                                            /><line
                                                x1="3"
                                                y1="6"
                                                x2="3.01"
                                                y2="6"
                                            /><line
                                                x1="3"
                                                y1="12"
                                                x2="3.01"
                                                y2="12"
                                            /><line
                                                x1="3"
                                                y1="18"
                                                x2="3.01"
                                                y2="18"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <div class="space-y-3 pt-2">
                            <div class="flex items-center justify-between">
                                <label
                                    class="text-xs font-medium text-muted-foreground"
                                    >Temperature</label
                                >
                                <span
                                    class="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded"
                                >
                                    {settings.providers.openai?.temperature?.toFixed(
                                        1,
                                    ) || "0.7"}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={settings.providers.openai?.temperature ||
                                    0.7}
                                on:input={(e) =>
                                    updateProviderSetting(
                                        "openai",
                                        "temperature",
                                        parseFloat(e.currentTarget.value),
                                    )}
                                class="styled-slider"
                            />
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Web Search -->
            <div class="space-y-4 pt-4 border-t border-border">
                <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                        <label class="text-sm font-medium">Web Search</label>
                        <p class="text-xs text-muted-foreground">
                            Enhance responses with web data
                        </p>
                    </div>

                    <div
                        class="relative inline-flex items-center cursor-pointer"
                        on:click={() => {
                            settings.webSearch.enabled =
                                !settings.webSearch.enabled;
                            settings = settings; // Force reactivity update
                            updateSetting("webSearch", settings.webSearch);
                        }}
                    >
                        <div
                            class="w-11 h-6 rounded-full transition-colors duration-200 ease-in-out"
                            style="background-color: {settings.webSearch.enabled
                                ? 'var(--text-muted)'
                                : 'var(--background-modifier-border)'}"
                        ></div>
                        <div
                            class="absolute top-[2px] left-[2px] bg-white rounded-full h-5 w-5 shadow-sm transition-transform duration-200 ease-in-out {settings
                                .webSearch.enabled
                                ? 'translate-x-[20px]'
                                : 'translate-x-0'}"
                        ></div>
                    </div>
                </div>

                {#if settings.webSearch.enabled}
                    <div
                        class="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200"
                    >
                        <label class="text-xs font-medium text-muted-foreground"
                            >SearXNG URL</label
                        >
                        <input
                            type="text"
                            bind:value={settings.webSearch.urlTemplate}
                            on:input={() =>
                                updateSetting("webSearch", settings.webSearch)}
                            class="flex w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                            placeholder="http://host:port/search?q=%s&language=a"
                        />
                        <p class="text-[10px] text-muted-foreground">
                            Use <code
                                class="bg-muted px-1 py-0.5 rounded text-foreground"
                                >%s</code
                            > as a placeholder for the query.
                        </p>
                    </div>
                {/if}
            </div>

            <div class="pt-8 pb-4 text-center">
                <p
                    class="text-[10px] text-muted-foreground/40 uppercase tracking-widest"
                >
                    AI Assistant v1.0
                </p>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Slider styles are handled globally in styles.css */
</style>
