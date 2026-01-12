import { FuzzySuggestModal } from "obsidian";
import type AiAssistantPlugin from "../main";
import type { CommandId, CommandSpec } from "../types/core";
import { COMMANDS } from "../commands/registry";

export class CommandPickerModal extends FuzzySuggestModal<CommandSpec> {
    private plugin: AiAssistantPlugin;
    private onChoose: (commandId: CommandId) => void;

    constructor(plugin: AiAssistantPlugin, onChoose: (commandId: CommandId) => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder("Search for a command...");
    }

    getItems(): CommandSpec[] {
        return [...COMMANDS];
    }

    getItemText(command: CommandSpec): string {
        return `${command.title} ${command.scope}`;
    }

    onChooseItem(command: CommandSpec, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(command.id);
    }
}
