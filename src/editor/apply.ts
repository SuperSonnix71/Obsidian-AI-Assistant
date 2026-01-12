
import { App as ObsidianApp, MarkdownView, Editor } from "obsidian";
import { DeliveryMode } from "../types/core";

export function applyToEditor(
    app: ObsidianApp,
    content: string,
    mode: DeliveryMode | "replace" | "insert" | "append"
) {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const editor = activeView.editor;

    // Normalize mode strings if needed (some are from CommandSpec, some from UI button)
    // UI ApplyBar sends "replace", "insert", "append".
    // CommandSpec has "replace_selection", "insert_below_selection", "append_to_note", "insert_at_cursor".

    switch (mode) {
        case "replace":
        case "replace_selection":
            editor.replaceSelection(content);
            break;

        case "insert":
        case "insert_below_selection":
            // Spec 10.2: set cursor to selection end; insert \n\n + output
            const to = editor.getCursor("to");
            editor.setCursor(to);
            editor.replaceRange(`\n\n${content}`, to);
            break;

        case "insert_at_cursor":
            const cursor = editor.getCursor();
            editor.replaceRange(content, cursor);
            break;

        case "append":
        case "append_to_note":
            const lastLine = editor.lineCount();
            const lastLineContent = editor.getLine(lastLine - 1);
            const separator = lastLineContent.trim() ? "\n\n" : "\n";
            editor.replaceRange(`${separator}${content}`, { line: lastLine, ch: 0 });
            break;

        case "chat_only":
            // Do nothing
            break;
    }
}
