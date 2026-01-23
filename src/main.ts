import { Plugin, App as ObsidianApp, PluginManifest, WorkspaceLeaf } from "obsidian";
import { PluginSettings } from "./types/settings";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { HistoryService } from "./history/store";
import { AiAssistantView, VIEW_TYPE_AI_ASSISTANT } from "./ui/view";
import { COMMANDS } from "./commands/registry";
import { trackActiveNote, VaultSummaryCache } from "./editor/context";

export default class AiAssistantPlugin extends Plugin {
    settings: PluginSettings;
    historyService: HistoryService;
    vaultSummaryCache: VaultSummaryCache;

    constructor(app: ObsidianApp, manifest: PluginManifest) {
        super(app, manifest);
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // deep copy defaults
    }

    async onload() {
        console.debug("Loading AI Assistant Plugin...");
        await this.loadSettings();

        // Register View
        this.registerView(
            VIEW_TYPE_AI_ASSISTANT,
            (leaf) => new AiAssistantView(leaf, this)
        );

        // Initialize History Service
        const data = await this.loadData();
        // Deep merge settings
        const loadedSettings = data?.settings || {};
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedSettings,
            providers: {
                ...DEFAULT_SETTINGS.providers,
                ...(loadedSettings.providers || {})
            },
            webSearch: {
                ...DEFAULT_SETTINGS.webSearch,
                ...(loadedSettings.webSearch || {})
            },
            history: {
                ...DEFAULT_SETTINGS.history,
                ...(loadedSettings.history || {})
            },
            ui: {
                ...DEFAULT_SETTINGS.ui,
                ...(loadedSettings.ui || {})
            }
        };

        this.historyService = new HistoryService(this, data?.historyStore);

        // Initialize vault summary cache with event-based invalidation
        // Uses O(N log K) heap algorithm for efficient Top-K extraction
        this.vaultSummaryCache = new VaultSummaryCache(this);

        // Track active note for reliable context when sidebar steals focus
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                trackActiveNote(this.app);
            })
        );

        // Add ribbon icon
        this.addRibbonIcon("bot", "AI assistant", () => {
            void this.activateView();
        });

        // Add command to open view
        this.addCommand({
            id: "open-ai-assistant",
            name: "Open AI assistant",
            callback: () => {
                void this.activateView();
            },
        });

        // Register specific commands
        COMMANDS.forEach(cmd => {
            this.addCommand({
                id: cmd.id,
                name: cmd.title,
                editorCallback: () => {
                    void this.activateView(cmd.id);
                }
            });
        });
    }

    async activateView(commandId?: string) {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_AI_ASSISTANT);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_AI_ASSISTANT, active: true });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
            if (commandId) {
                const view = leaf.view as AiAssistantView;
                view.setCommand(commandId);
            }
        }
    }

    onunload() {
        void this.saveSettings();
    }

    async loadSettings() {
        // Loaded in onload manually to handle structure
    }

    async saveSettings() {
        await this.saveData({
            settings: this.settings,
            historyStore: this.historyService.getStore()
        });
    }
}
