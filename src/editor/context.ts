
import { App as ObsidianApp, MarkdownView, Editor } from "obsidian";

// Track the last active note path for reliable context when sidebar steals focus
let lastActiveNotePath: string | null = null;

/**
 * Call this on 'active-leaf-change' to track the last active markdown note.
 * This ensures we can recover the correct context when the sidebar is focused.
 */
export function trackActiveNote(app: ObsidianApp): void {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) {
        lastActiveNotePath = activeView.file.path;
    }
}

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

    // 2. If no focused markdown view, try to use the last tracked active note
    if (!activeView) {
        const leaves = app.workspace.getLeavesOfType("markdown");
        if (leaves.length > 0) {
            // First, try to find the leaf matching our tracked last active note
            if (lastActiveNotePath) {
                const trackedLeaf = leaves.find(l => {
                    const v = l.view as any;
                    return v.file?.path === lastActiveNotePath;
                });
                if (trackedLeaf) {
                    activeView = trackedLeaf.view as MarkdownView;
                }
            }

            // Fallback: Find the first leaf that is a MarkdownView AND has a valid file
            if (!activeView) {
                const validLeaf = leaves.find(l => {
                    const v = l.view as any;
                    const isMarkdown = v instanceof MarkdownView || (v.getViewType && v.getViewType() === "markdown");
                    return isMarkdown && !!v.file;
                });

                if (validLeaf) {
                    activeView = validLeaf.view as MarkdownView;
                }
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

// Maximum number of notes to include in vault summary to prevent token overflow
const MAX_VAULT_NOTES = 500;

export interface VaultNoteSummary {
    path: string;
    title: string;
    tags: string[];
    frontmatter: Record<string, any> | null;
}

export interface VaultSummary {
    noteCount: number;
    includedCount: number;
    truncated: boolean;
    notes: VaultNoteSummary[];
}

/**
 * Get a summary of all notes in the vault including metadata.
 * Used for vault-scoped commands to give AI context about available notes.
 */
export function getVaultSummary(app: ObsidianApp): VaultSummary {
    const files = app.vault.getMarkdownFiles();
    const totalCount = files.length;
    const truncated = totalCount > MAX_VAULT_NOTES;
    
    // Sort by modification time (most recent first) and limit
    // Use spread to avoid mutating the original array from getMarkdownFiles()
    const sortedFiles = [...files]
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, MAX_VAULT_NOTES);
    
    const notes: VaultNoteSummary[] = sortedFiles.map(file => {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || null;
        
        // Extract tags from frontmatter and inline tags
        const tags: string[] = [];
        
        // Tags from frontmatter
        if (frontmatter?.tags) {
            if (Array.isArray(frontmatter.tags)) {
                tags.push(...frontmatter.tags.map((t: string) => t.startsWith('#') ? t : `#${t}`));
            } else if (typeof frontmatter.tags === 'string') {
                tags.push(frontmatter.tags.startsWith('#') ? frontmatter.tags : `#${frontmatter.tags}`);
            }
        }
        
        // Inline tags from cache
        if (cache?.tags) {
            cache.tags.forEach(tagCache => {
                if (!tags.includes(tagCache.tag)) {
                    tags.push(tagCache.tag);
                }
            });
        }
        
        return {
            path: file.path,
            title: frontmatter?.title || file.basename,
            tags,
            frontmatter: frontmatter ? { ...frontmatter } : null
        };
    });
    
    return {
        noteCount: totalCount,
        includedCount: notes.length,
        truncated,
        notes
    };
}
