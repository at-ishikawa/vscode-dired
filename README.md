# vscode-dired

*vscode-dired* is an File Manager (or Directory Editor) for VS Code.

![vscode-dired Demo](https://github.com/shirou/vscode-dired/raw/master/vscode-dired.gif)

This is a port from Emacs dired-mode.

## Features

Filer used by only keyboard.

## Configuration

- `extension.dired.open`

## Key Binding

- `crtl+x f`
  - open dired.
- `+`
  - Create new directory.
- `R`
  - Rename.
- `C`
  - Copy file.
- `B`
  - Go to up directory.
- `g`
  - Refresh current directory contents.
- `q`
  - Go back to previous directory (or close if no history).
- `Ctrl+C Ctrl+E`
  - Enter wdired mode for editing filenames.

## Wdired Mode

Wdired (Writable Dired) mode allows you to edit filenames directly in the dired buffer:

1. Press `Ctrl+C Ctrl+E` to enter wdired mode
2. Edit filenames directly in the buffer
3. Press `Ctrl+C Ctrl+C` to commit changes (files will be renamed)
4. Press `Ctrl+C Ctrl+K` to abort and revert changes

## LICENSE

apache 2.0
