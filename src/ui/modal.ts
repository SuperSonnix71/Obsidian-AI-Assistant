
import { Modal, type App as ObsidianApp } from "obsidian";
import App from "./svelte/App.svelte";
import type AiAssistantPlugin from "../main";

export class AiModal extends Modal {
    private component: App | undefined;
    private plugin: AiAssistantPlugin;
    private initialCommandId?: string;

    constructor(app: ObsidianApp, plugin: AiAssistantPlugin, initialCommandId?: string) {
        super(app);
        this.plugin = plugin;
        this.initialCommandId = initialCommandId;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.style.width = `${this.plugin.settings.ui.modalWidthPx}px`;
        this.modalEl.style.height = `${this.plugin.settings.ui.modalHeightPx}px`;

        this.component = new App({
            target: contentEl,
            props: {
                plugin: this.plugin,
                initialCommandId: this.initialCommandId,
                onClose: () => this.close()
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        if (this.component) {
            this.component.$destroy();
            this.component = undefined;
        }
        contentEl.empty();
    }
}

