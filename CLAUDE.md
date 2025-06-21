# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Document Organization

All Claude-specific documentation (test plans, implementation notes, etc.) should be stored in the `.claude/` directory to keep the main repository clean. This includes:
- Test cases and test plans
- Implementation notes and changes
- Any temporary documentation created during development sessions

Do not create these files in the root directory.

## Development Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Run linting (note: currently has config issues with TypeScript imports)
npm run lint

# Run tests
npm run test

# Package extension for installation
npx @vscode/vsce package

# Install packaged extension to VSCode
code --install-extension vscode-dired-mode-X.X.X.vsix
```

## Architecture Overview

This VSCode extension implements a file manager similar to Emacs dired-mode, using VSCode's `TextDocumentContentProvider` API to render directory contents as virtual documents.

### Core Components

- **extension.ts**: Main entry point that registers commands and keybindings. Contains the `activate()` function that initializes the `DiredProvider` and registers all command handlers.

- **provider.ts**: The `DiredProvider` class implements `TextDocumentContentProvider` and handles:
  - Directory content rendering as virtual text documents
  - Directory navigation with history tracking (`_directoryHistory`)
  - File operations (create, rename, copy, delete)
  - Buffer management and state tracking
  - Wdired mode using untitled documents (no temp files)

- **fileItem.ts**: `FileItem` class represents individual files/directories with metadata (permissions, size, etc.) and handles line formatting for the dired buffer display.

- **autocompletedInputBox.ts**: Provides file path autocompletion for user input operations.

### Key Architecture Patterns

**Virtual Document System**: Uses VSCode's URI scheme `dired://` to create virtual documents that display directory contents. The provider renders directory listings as text, with each line representing a file/directory.

**Wdired Mode**: For editable mode (wdired), the extension uses untitled documents instead of temporary files to avoid file deletion confirmation dialogs. This provides a seamless editing experience.

**Command-Based Operations**: All functionality is exposed through VSCode commands (e.g., `extension.dired.open`, `extension.dired.enter`) with keyboard shortcuts defined in package.json.

**Directory History**: The extension maintains navigation history in `DiredProvider._directoryHistory` to support back navigation (modified 'q' key behavior).

**State Management**: Current directory state is determined by parsing the first line of the active dired buffer document, not stored separately.

**Directory Opening Logic**: When opening dired from non-file tabs (e.g., magit status), the extension intelligently falls back to the workspace root directory instead of the home directory.

### Extension Configuration

Key package.json configurations:
- `dired.fixed_window`: Controls whether dired opens in same tab or new tab
- `dired.ask_directory`: Whether to prompt for directory path on open
- Activation event: `onCommand:extension.dired.open`
- Main entry: `./out/src/extension` (compiled JavaScript)

### Testing the Extension

After making changes:
1. Run `npm run compile` to build TypeScript
2. Package with `npx @vscode/vsce package`
3. Install with `code --install-extension vscode-dired-mode-X.X.X.vsix`
4. Test using `Ctrl+X F` to open dired buffer

The extension uses the `dired` language mode for syntax highlighting of the directory listing format.

### Recent Improvements

1. **Fixed Double Confirmation Dialog**: Delete operations now show only one confirmation dialog, even for directories with files.

2. **Wdired Validation**: Added comprehensive validation to prevent file creation/deletion in wdired mode while allowing filename changes.

3. **Virtual Documents**: Implemented proper virtual document support using TextDocumentContentProvider for read-only dired buffers.

4. **Wdired Without Temp Files**: Wdired mode now uses untitled documents instead of temporary files, eliminating file deletion confirmation dialogs.

5. **Smart Directory Detection**: Fixed issue where dired would open home directory from non-file tabs - now correctly opens workspace root.

### Known Limitations

- Virtual documents created with TextDocumentContentProvider are read-only by design
- Wdired mode requires switching to an untitled document for editing
- File watching and auto-refresh are not yet implemented