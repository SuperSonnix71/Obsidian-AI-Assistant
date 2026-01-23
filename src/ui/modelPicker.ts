import { FuzzySuggestModal, App } from "obsidian";
import type { ModelInfo } from "../providers/types";

export class ModelPickerModal extends FuzzySuggestModal<ModelInfo> {
    private models: ModelInfo[];
    private onChoose: (modelId: string) => void;

    constructor(app: App, models: ModelInfo[], onChoose: (modelId: string) => void) {
        super(app);
        this.models = models;
        this.onChoose = onChoose;
        this.setPlaceholder("Select a model...");
    }

    getItems(): ModelInfo[] {
        return this.models;
    }

    getItemText(model: ModelInfo): string {
        return model.id;
    }

    onChooseItem(model: ModelInfo, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(model.id);
    }
}
