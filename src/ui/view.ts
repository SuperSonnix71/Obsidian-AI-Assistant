import { ItemView, WorkspaceLeaf } from "obsidian";
import App from "./svelte/App.svelte";
import type AiAssistantPlugin from "../main";

export const VIEW_TYPE_AI_ASSISTANT = "ai-assistant-view";

export class AiAssistantView extends ItemView {
    component: App | undefined;
    plugin: AiAssistantPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: AiAssistantPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_AI_ASSISTANT;
    }

    getDisplayText() {
        return "AI Assistant";
    }

    getIcon() {
        return "bot";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        // Ensure container takes full size for h-full to work
        container.addClass("h-full");
        container.addClass("ai-assistant-view-root");

        this.component = new App({
            target: container,
            props: {
                plugin: this.plugin,
                onClose: () => { }
            }
        });
    }

    setCommand(commandId: string) {
        if (this.component) {
            this.component.$set({ initialCommandId: commandId });
            // We might also want to trigger the "select command" logic if App.svelte exposes it or reacts to prop change
        }
    }


    async onClose() {
        if (this.component) {
            this.component.$destroy();
        }
    }
}
