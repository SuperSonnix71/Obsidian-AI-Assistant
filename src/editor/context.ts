
import { App as ObsidianApp, MarkdownView, Editor, Plugin, TFile, TAbstractFile } from "obsidian";
import { findTopK } from "../utils/minheap";

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

// Debounce delay for cache invalidation (ms)
const CACHE_INVALIDATE_DEBOUNCE = 500;

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
 * Build a single note summary from a TFile.
 * Uses Set for O(1) tag deduplication instead of O(m²) with includes().
 */
function buildNoteSummary(app: ObsidianApp, file: TFile): VaultNoteSummary {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter || null;
    
    // Use Set for O(1) deduplication instead of O(m²) with includes()
    const tagSet = new Set<string>();
    
    // Tags from frontmatter
    if (frontmatter?.tags) {
        if (Array.isArray(frontmatter.tags)) {
            frontmatter.tags.forEach((t: string) => {
                tagSet.add(t.startsWith('#') ? t : `#${t}`);
            });
        } else if (typeof frontmatter.tags === 'string') {
            tagSet.add(frontmatter.tags.startsWith('#') ? frontmatter.tags : `#${frontmatter.tags}`);
        }
    }
    
    // Inline tags from cache
    if (cache?.tags) {
        cache.tags.forEach(tagCache => {
            tagSet.add(tagCache.tag);
        });
    }
    
    return {
        path: file.path,
        title: frontmatter?.title || file.basename,
        tags: Array.from(tagSet),
        frontmatter: frontmatter ? { ...frontmatter } : null
    };
}

/**
 * Build vault summary using heap-based Top-K algorithm.
 * Time complexity: O(N log K) instead of O(N log N) for full sort.
 */
function buildVaultSummary(app: ObsidianApp): VaultSummary {
    const files = app.vault.getMarkdownFiles();
    const totalCount = files.length;
    const truncated = totalCount > MAX_VAULT_NOTES;
    
    // Use heap-based Top-K algorithm: O(N log K) instead of O(N log N)
    const topFiles = findTopK(
        files,
        MAX_VAULT_NOTES,
        (file) => file.stat.mtime
    );
    
    // Sort the top K files by mtime descending for consistent ordering
    topFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
    
    const notes: VaultNoteSummary[] = topFiles.map(file => buildNoteSummary(app, file));
    
    return {
        noteCount: totalCount,
        includedCount: notes.length,
        truncated,
        notes
    };
}

/**
 * Cache for vault summary with event-based invalidation.
 * Provides O(1) access for repeated queries within the same session.
 */
export class VaultSummaryCache {
    private cache: VaultSummary | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private app: ObsidianApp;

    constructor(plugin: Plugin) {
        this.app = plugin.app;
        
        // Register event listeners for cache invalidation
        // Using registerEvent ensures proper cleanup on plugin unload
        plugin.registerEvent(
            plugin.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.invalidate();
                }
            })
        );
        
        plugin.registerEvent(
            plugin.app.vault.on('delete', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.invalidate();
                }
            })
        );
        
        plugin.registerEvent(
            plugin.app.vault.on('rename', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.invalidate();
                }
            })
        );
        
        // Invalidate on metadata changes (frontmatter/tags updates)
        plugin.registerEvent(
            plugin.app.metadataCache.on('changed', (file: TFile) => {
                if (file.extension === 'md') {
                    this.invalidate();
                }
            })
        );
    }

    /**
     * Invalidate the cache with debouncing to handle rapid file changes.
     */
    private invalidate(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.cache = null;
            this.debounceTimer = null;
        }, CACHE_INVALIDATE_DEBOUNCE);
    }

    /**
     * Get the vault summary, using cache if available.
     * O(1) for cache hit, O(N log K) for cache miss.
     */
    get(): VaultSummary {
        if (this.cache) {
            return this.cache;
        }
        this.cache = buildVaultSummary(this.app);
        return this.cache;
    }

    /**
     * Force rebuild the cache (useful for testing or manual refresh).
     */
    rebuild(): VaultSummary {
        this.cache = buildVaultSummary(this.app);
        return this.cache;
    }
}

/**
 * Get a summary of all notes in the vault including metadata.
 * Used for vault-scoped commands to give AI context about available notes.
 * 
 * @deprecated Use VaultSummaryCache.get() for better performance with caching.
 * This function is kept for backward compatibility but builds fresh each time.
 */
export function getVaultSummary(app: ObsidianApp): VaultSummary {
    return buildVaultSummary(app);
}
