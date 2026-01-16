<div align="center">
  <img width="100" height="100" alt="icon" src="https://github.com/user-attachments/assets/af8d9a43-6eac-4367-851a-2d9406aa797e" />
</div>

<div align="center">
  <a href="https://github.com/SuperSonnix71/obsidian-ai-assistant/releases">
    <img src="https://img.shields.io/badge/Release-v1.0.4-blue" alt="Release v1.0.4" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT" />
  </a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux-lightgrey" alt="Platform macOS | Linux" />
</div>

<br>
<br>

# Obsidian AI Assistant

A fully private AI assistant plugin for Obsidian that runs entirely on your machine. Works offline, keeps your data private, and connects to any OpenAI-compatible model.

**Features:**
- Local AI integration (Ollama, vLLM, llama.cpp, or any OpenAI-compatible endpoint)
- Fully private—no data leaves your vault
- Rich text manipulation: explain, expand, rewrite, summarize, and create notes
- Optional web search grounding via SearXNG for context-aware responses
- Per-note and vault-wide chat history
- Token-by-token streaming UI for real-time responses
- Works on macOS and Linux (desktop only)

---

## Installation

1. **Download the plugin** from [GitHub Releases](https://github.com/SuperSonnix71/obsidian-ai-assistant/releases)

2. **Extract to your vault's plugin directory**
   - Locate your vault's `.obsidian/plugins/` folder
   - Create a new directory: `.obsidian/plugins/obsidian-ai-assistant/`
   - Copy the following files from the release into that directory:
     - `main.js`
     - `manifest.json`
     - `styles.css`

3. **Enable the plugin**
   - Open Obsidian and go to **Settings → Community plugins → Installed plugins**
   - Find **Obsidian AI Assistant** and toggle it on

### Building from Source

If you want to build the plugin yourself:

1. Clone the repository
   ```bash
   git clone https://github.com/SuperSonnix71/obsidian-ai-assistant.git
   cd obsidian-ai-assistant
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the plugin
   ```bash
   npm run build
   ```

4. Copy the built files to your vault
   ```bash
   mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-ai-assistant/
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsidian-ai-assistant/
   ```

5. Reload Obsidian and enable the plugin in **Community plugins**

---

## Quick Start

### 1. Set Up a Local LLM Server

Choose one of the following:

#### **Ollama** (Recommended)
```bash
# Install from https://ollama.ai
ollama pull llama2
ollama serve
```
Default: `http://localhost:11434`

#### **vLLM**
```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-hf \
  --port 8000
```
Access at: `http://localhost:8000`

#### **llama.cpp Server**
```bash
./server -m model.gguf -p 8000
```
Access at: `http://localhost:8000`

### 2. Configure the Plugin

1. Open Obsidian and enable the **Obsidian AI Assistant** plugin
2. Go to **Settings → Obsidian AI Assistant**
3. Select your provider (Ollama, OpenAI-compatible, etc.)
4. Enter the base URL (e.g., `http://localhost:11434` for Ollama)
5. Choose a model from the dropdown (auto-populated for Ollama)
6. Adjust temperature if desired (default: 0.7)

### 3. Use the Plugin

#### Selection-based Commands
- **Explain selection** – Understand selected text
- **Expand selection** – Add more detail or context
- **Rewrite selection** – Available styles: Formal, Casual, Active Voice, Bullet Points
- **Caption selection** – Generate a caption for the selection
- **Summarize selection** – Condense selected text

#### Note-based Commands
- **Chat (this note)** – Persistent conversation with the current note as context

#### Vault-based Commands
- **Search vault for notes** – Find notes by title, aliases, headings, tags, or description (clickable wikilinks)
- **Research & Create Note** – Generate a new note based on web research results

All commands are accessible via:
- **Command Palette** (Cmd/Ctrl + P)
- **Editor context menu** (right-click)
- **Plugin modal** (toggle from ribbon icon or command palette)

---

## Configuration

### Provider Settings

#### Ollama
- **Base URL**: `http://localhost:11434` (default)
- **Model selection**: Automatically populated from `/api/tags`
- **Temperature**: 0.0 (deterministic) to 1.0 (creative)

#### OpenAI-Compatible (vLLM, llama.cpp, etc.)
- **Base URL**: Endpoint of your server (e.g., `http://localhost:8000`)
- **API Key** (optional): Some servers may require this
- **Model**: Manually specify or auto-fetch from `/v1/models`
- **Temperature**: Adjustable per request

### Web Search Grounding

Enable optional web search to augment AI responses with current information:

1. **Enable Web Search** in plugin settings
2. **Set Search URL Template**: Default is SearXNG (`https://searx.be/search?q=%s&format=json`)
3. Results are injected into the LLM context as quoted, attributed snippets

**Recommended:** Self-host [SearXNG] for full privacy.

### Chat History Retention

Configure how long conversations are kept:
- **Per-note max messages**: Default 80
- **Vault-wide max messages**: Default 400
- **Max message character limit**: 20,000

---

## Architecture

### Core Modules

- **Provider Layer** (`src/providers/`) – Normalizes requests across Ollama and OpenAI-compatible servers
- **History Layer** (`src/history/`) – Manages per-note and vault-wide chat persistence
- **Editor Integration** (`src/editor/`) – Handles text selection, insertion, and replacement
- **UI Layer** (`src/ui/`) – Obsidian Modal with React + shadcn/ui components
- **Web Search** (`src/websearch/`) – Integrates external search results

### Technology Stack

- **Obsidian API** – Plugin framework
- **TypeScript** – Type-safe development
- **Svelte** – UI components
- **Tailwind CSS** – Styling
- **esbuild** – Bundling
-

---

## Development

### Build Commands

- **Development mode** (watch + rebuild on changes)
  ```bash
  npm run dev
  ```

- **Production build**
  ```bash
  npm run build
  ```

- **Local deployment** (copy to vault)
  ```bash
  ./deploy.sh
  ```

- **Type checking**
  ```bash
  npm run svelte-check
  ```

### Project Structure

```
src/
├── main.ts                 # Plugin entry point
├── commands/               # Command definitions and execution
├── editor/                 # Text selection and insertion logic
├── history/                # Chat persistence and retention
├── providers/              # LLM provider integrations
│   ├── ollama.ts          # Ollama API client
│   ├── openai_compatible.ts # OpenAI-compatible servers
│   └── transport/          # HTTP and streaming utilities
├── settings/               # Configuration and defaults
├── types/                  # TypeScript interfaces
├── ui/                     # Obsidian Modal and UI components
│   └── svelte/            # Svelte components
└── websearch/              # Web search integration
```

---

## Privacy & Security

- **Zero cloud integration** – All processing happens locally
- **Vault privacy** – No data is sent outside your machine
- **Open source** – Fully auditable code
- **Web search** – Results are treated as untrusted; prompts explicitly instruct the model to quote and attribute sources

---

## Troubleshooting

### Plugin doesn't connect to Ollama
- Verify Ollama is running: `ollama serve` (should be at `http://localhost:11434`)
- Check the plugin settings for correct base URL
- Ensure no firewall is blocking localhost connections

### Models aren't loading
- For Ollama: Run `ollama pull <model-name>` first
- For OpenAI-compatible: Ensure `/v1/models` endpoint is accessible
- Check browser console (Obsidian → Ctrl+Shift+I) for detailed errors

### Web search returns errors
- Verify the search URL is correct and accessible
- Test the URL manually: `https://your-searxng/search?q=test&format=json`
- Ensure it returns valid JSON

### Performance issues
- Reduce **Modal Width/Height** in settings
- Lower history retention limits if chat slows down
- Consider running a smaller, faster model

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to the branch and open a Pull Request

For major changes, please open an issue first to discuss what you'd like to change.

---

## License

MIT License – See [LICENSE](LICENSE) for details

---

## Credits

Built by [SuperSonnix71](https://github.com/SuperSonnix71)

---

## Support

- [Obsidian Plugin Docs](https://docs.obsidian.md/)
- [GitHub Issues](https://github.com/SuperSonnix71/obsidian-ai-assistant/issues)
