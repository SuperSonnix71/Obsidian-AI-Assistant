
import { App as ObsidianApp, MarkdownView, Editor } from "obsidian";

export interface EditorContext {
    note: { path: string; title: string };
    selection?: {
        text: string;
        from: { line: number; ch: number };
        to: { line: number; ch: number };
    };
    fullText: string | null;
}

export function getEditorContext(app: ObsidianApp): EditorContext | null {
    // 1. Try to get the currently active Markdown view (focused)
    let activeView = app.workspace.getActiveViewOfType(MarkdownView);

    // 2. If no focused markdown view, look for ANY open markdown leaf
    if (!activeView) {
        const leaves = app.workspace.getLeavesOfType("markdown");
        if (leaves.length > 0) {
            // Find the first leaf that is a MarkdownView AND has a valid file associated
            const validLeaf = leaves.find(l => {
                const v = l.view as any; // Cast to any to safely check custom props or mix types
                // Check correct view type and ensure file exists
                const isMarkdown = v instanceof MarkdownView || (v.getViewType && v.getViewType() === "markdown");
                return isMarkdown && !!v.file;
            });

            if (validLeaf) {
                activeView = validLeaf.view as MarkdownView;
            }
        }
    }

    // 3. Last resort: Check if there's an active editor that isn't a View (rare, but possible in Canvas/etc sometimes)
    // Not implemented here to keep types simple, assuming MarkdownView is the target.

    if (!activeView) {
        console.warn("AI Assistant: Failed to find active MarkdownView.");
        return null;
    }

    const editor = activeView.editor;
    const file = activeView.file;

    if (!file) {
        // Double check: if we came from getActiveViewOfType which doesn't check file
        console.warn("AI Assistant: MarkdownView found but no file associated.");
        // If the focused view has no file, maybe we should try the fallback search?
        // But for now, let's just return null to avoid crashes.
        return null;
    }

    const selection = editor.getSelection();
    const cursorFrom = editor.getCursor("from");
    const cursorTo = editor.getCursor("to");

    return {
        note: {
            path: file.path,
            title: file.basename
        },
        selection: selection ? {
            text: selection,
            from: { line: cursorFrom.line, ch: cursorFrom.ch },
            to: { line: cursorTo.line, ch: cursorTo.ch }
        } : undefined,
        fullText: editor.getValue()
    };
}
