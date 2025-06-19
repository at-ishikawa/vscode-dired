# vscode-dired

*vscode-dired* is an File Manager (or Directory Editor) for VS Code, forked from [shirou's vscode-dired](https://github.com/shirou/vscode-dired).

![vscode-dired Demo](https://github.com/at-ishikawa/vscode-dired/raw/master/vscode-dired.gif)

This is a port from Emacs dired-mode.

## Why forked?

There are 2 challenges I faced in the original vscode-dired.

- The keybindings are different from original Emacs
- There is no feature for a directory back or writable directory mode

## Features

Filer used by only keyboard.

## Key Bindings

Keybindings follow standard Emacs dired conventions as default:

### Opening Dired
- `Ctrl+X d` - Open dired buffer

### Navigation
- `n` / `Space` - Move cursor down to next file
- `p` - Move cursor up to previous file

### File Operations
- `Enter` / `f` / `o` - Open file or enter directory
- `^` - Go up to parent directory
- `shift+r (R)` - Rename or move file or directory
- `shift+c (C)` - Copy file or directory
- `shift+d (D)` - Delete file or directory recursively
- `+` - Create new directory

### Buffer Operations
- `g` - Refresh current directory contents
- `q` - Go back to previous directory (or close if no history)

### Wdired Mode

- `Ctrl+x Ctrl+q` - Enter wdired mode for editing filenames

## Wdired Mode

Wdired (Writable Dired) mode allows you to edit filenames directly in the dired buffer:

1. Press `Ctrl+x Ctrl+q` to enter wdired mode
2. Edit filenames directly in the buffer
3. Press `Ctrl+c Ctrl+c` to commit changes (files will be renamed)
4. Press `Ctrl+c ESC` to abort and revert changes

## LICENSE

apache 2.0
