'use strict';

import * as vscode from 'vscode';
import DiredProvider from './provider';
import FileItem from './fileItem';

import * as fs from 'fs';
import * as path from 'path';
import { autocompletedInputBox } from './autocompletedInputBox';

export interface ExtensionInternal {
    DiredProvider: DiredProvider,
}

export function activate(context: vscode.ExtensionContext): ExtensionInternal {
    let ask_dir = true;
    const configuration = vscode.workspace.getConfiguration('dired');
    if (configuration.has('ask_directory')) {
        ask_dir = configuration.ask_directory;
    }
    let fixed_window = false;
    if (configuration.has('fixed_window')) {
        fixed_window = configuration.fixed_window;
    }

    const provider = new DiredProvider(fixed_window);
    
    // Register the provider as a TextDocumentContentProvider
    const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(DiredProvider.scheme, provider);
    
    const commandOpen = vscode.commands.registerCommand("extension.dired.open", () => {
        let dir: string | undefined;
        const at = vscode.window.activeTextEditor;
        
        if (at) {
            if (provider.isDiredDocument(at.document)) {
                // If we're in a dired buffer, use its directory
                dir = provider.dirname;
            } else if (at.document.fileName && !at.document.isUntitled) {
                // If it's a regular file with a valid path, use its directory
                try {
                    const filePath = at.document.fileName;
                    if (fs.existsSync(filePath)) {
                        dir = path.dirname(filePath);
                    }
                } catch {
                    // Ignore errors for invalid paths
                }
            }
        }
        
        // If we couldn't get a directory from the active editor, use workspace root
        if (!dir) {
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                dir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else {
                // Only fall back to home directory if there's no workspace
                dir = require('os').homedir();
            }
        }
        
        if (dir) {
            if (!ask_dir) {
                provider.openDir(dir);
            } else {
                vscode.window.showInputBox({ value: dir, valueSelection: [dir.length, dir.length] })
                    .then((path) => {
                        if (!path) {
                            return;
                        }
                        if (fs.statSync(path).isDirectory()) {
                            provider.openDir(path);
                        } else if (fs.statSync(path).isFile()) {
                            const f = new FileItem(path, "", false, true); // Incomplete FileItem just to get URI.
                            const uri = f.uri;
                            if (uri) {
                                provider.showFile(uri);
                            }
                        }
                    });
            }
        }
    });
    const commandEnter = vscode.commands.registerCommand("extension.dired.enter", () => {
        provider.enter();
    });
    const commandToggleDotFiles = vscode.commands.registerCommand("extension.dired.toggleDotFiles", () => {
        provider.toggleDotFiles();
    });

    const commandCreateDir = vscode.commands.registerCommand("extension.dired.createDir", async () => {
        let dirName = await vscode.window.showInputBox({
            prompt: "Directory name"
         });
        if (!dirName) {
            return;
        }
        await provider.createDir(dirName);
    });
    const commandRename = vscode.commands.registerCommand("extension.dired.rename", async () => {
        const f = provider.getFile();
        if (!f) {
            vscode.window.showErrorMessage("No file selected");
            return;
        }
        
        const currentDir = provider.dirname;
        if (!currentDir) {
            vscode.window.showErrorMessage("No current directory found");
            return;
        }
        
        const currentPath = path.join(currentDir, f.fileName);
        const newPath = await vscode.window.showInputBox({
            prompt: "New path (rename or move file)",
            value: currentPath,
            valueSelection: [currentPath.lastIndexOf('/') + 1, currentPath.length]
        });
        
        if (newPath) {
            await provider.rename(newPath);
        }
    });
    const commandCopy = vscode.commands.registerCommand("extension.dired.copy", async () => {
        const f = provider.getFile();
        if (!f) {
            vscode.window.showErrorMessage("No file selected");
            return;
        }
        
        const currentDir = provider.dirname;
        if (!currentDir) {
            vscode.window.showErrorMessage("No current directory found");
            return;
        }
        
        const currentPath = path.join(currentDir, f.fileName);
        const newPath = await vscode.window.showInputBox({
            prompt: "Copy to path (copy file/directory)",
            value: currentPath,
            valueSelection: [currentPath.lastIndexOf('/') + 1, currentPath.length]
        });
        
        if (newPath) {
            await provider.copy(newPath);
        }
    });

    const commandDelete = vscode.commands.registerCommand("extension.dired.delete", async () => {
        const f = provider.getFile();
        if (!f) {
            vscode.window.showErrorMessage("No file selected");
            return;
        }

        const currentDir = provider.dirname;
        if (!currentDir) {
            vscode.window.showErrorMessage("No current directory found");
            return;
        }

        const targetPath = path.join(currentDir, f.fileName);
        
        try {
            const stat = fs.statSync(targetPath);
            let confirmationMessage: string;
            let isRecursive = false;
            
            if (stat.isDirectory()) {
                const items = fs.readdirSync(targetPath);
                if (items.length === 0) {
                    confirmationMessage = `Delete empty directory "${f.fileName}"?`;
                } else {
                    confirmationMessage = `Delete directory "${f.fileName}" and its ${items.length} item(s) recursively?`;
                    isRecursive = true;
                }
            } else {
                confirmationMessage = `Delete file "${f.fileName}"?`;
            }

            const deleteButton = isRecursive ? "Delete Recursively" : "Delete";
            const confirmation = await vscode.window.showWarningMessage(
                confirmationMessage,
                { modal: true },
                deleteButton,
                "Cancel"
            );

            if (confirmation === deleteButton) {
                await provider.delete();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to access ${f.fileName}: ${error}`);
        }
    });

    const commandGoUpDir = vscode.commands.registerCommand("extension.dired.goUpDir", () => {
        provider.goUpDir();
    });
    const commandRefresh = vscode.commands.registerCommand("extension.dired.refresh", () => {
        provider.reload();
    });
    const commandSelect = vscode.commands.registerCommand("extension.dired.select", () => {
        provider.select();
    });
    const commandUnselect = vscode.commands.registerCommand("extension.dired.unselect", () => {
        provider.unselect();
    });
    const commandClose = vscode.commands.registerCommand("extension.dired.back", () => {
        provider.goBackDir();
    });


    const commandWdiredCommit = vscode.commands.registerCommand("extension.dired.wdired.commit", () => {
        provider.exitWdiredMode(true);
    });

    const commandWdiredAbort = vscode.commands.registerCommand("extension.dired.wdired.abort", () => {
        provider.exitWdiredMode(false);
    });

    const commandToggleReadOnly = vscode.commands.registerCommand("extension.dired.toggleReadOnly", () => {
        provider.toggleReadOnly();
    });

    const commandCreateFile = vscode.commands.registerCommand("extension.dired.createFile", async () => {
        function* completionFunc(filePathOrDirPath: string): IterableIterator<vscode.QuickPickItem> {
            let dirname: string;
            if (!path.isAbsolute(filePathOrDirPath)) {
                if (provider.dirname === undefined)
                    {return;}
                filePathOrDirPath = path.join(provider.dirname, filePathOrDirPath);
            }
            try {
                let stat = fs.statSync(filePathOrDirPath);
                if (stat.isDirectory()) {
                    dirname = filePathOrDirPath;
                    yield {
                        detail: "Open " + path.basename(filePathOrDirPath) + "/",
                        label: filePathOrDirPath,
                        buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                    };
                }
                else {
                    yield {
                        detail: "Open " + path.basename(filePathOrDirPath),
                        label: filePathOrDirPath,
                        buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                    };

                    dirname = path.dirname(filePathOrDirPath);
                }
            }
            catch
            {
                yield {
                    detail: "Create " + path.basename(filePathOrDirPath),
                    label: filePathOrDirPath,
                    buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                };
                dirname = path.dirname(filePathOrDirPath);
                try {
                    fs.accessSync(filePathOrDirPath, fs.constants.F_OK);
                }
                catch
                {
                    return;
                }
            }
            for (let name of fs.readdirSync(dirname)) {
                const fullpath = path.join(dirname, name);
                if (fs.statSync(fullpath).isDirectory())
                    {yield {
                        label: fullpath, detail: "Open " + name + "/",
                        buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                    };}
                else
                    {yield {
                        label: fullpath, detail: "Open" + name,
                        buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                    };}
            }
        }
        function processSelf(self: vscode.QuickPick<vscode.QuickPickItem>) {
            self.placeholder = "Create File or Open";
        }
        let fileName = await autocompletedInputBox(
            {
                completion: completionFunc,
                withSelf: processSelf,
            });
        vscode.window.showInformationMessage(fileName);
        let isDirectory = false;

        try {
            let stat = await fs.promises.stat(fileName);
            if (stat.isDirectory())
                {isDirectory = true;}
        }
        catch {
            await fs.promises.mkdir(path.dirname(fileName), { recursive: true });
            await fs.promises.writeFile(fileName, "");
        }

        if (isDirectory) {
            provider.openDir(fileName);
        }
        else {
            await provider.createFile(fileName);
        }

    });

    // Event handlers
    const activeEditorHandler = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && provider.isDiredDocument(editor.document)) {
            editor.options = {
                cursorStyle: vscode.TextEditorCursorStyle.Block,
            };
            vscode.commands.executeCommand('setContext', 'dired.open', true);
            // Also check if it's in wdired mode
            if (provider.isWdiredMode(editor.document)) {
                vscode.commands.executeCommand('setContext', 'dired.wdired', true);
            } else {
                vscode.commands.executeCommand('setContext', 'dired.wdired', false);
            }
        } else {
            vscode.commands.executeCommand('setContext', 'dired.open', false);
            vscode.commands.executeCommand('setContext', 'dired.wdired', false);
        }
    });

    const documentCloseHandler = vscode.workspace.onDidCloseTextDocument((document) => {
        if (provider.isDiredDocument(document)) {
            // If it's a wdired document being closed, clean up
            if (provider.isWdiredMode(document)) {
                // Exit wdired mode without committing changes
                provider.exitWdiredMode(false);
            }
            
            // Check if there are any other dired documents still open
            const stillHasDiredOpen = vscode.window.visibleTextEditors.some(editor =>
                provider.isDiredDocument(editor.document)
            );
            if (!stillHasDiredOpen) {
                vscode.commands.executeCommand('setContext', 'dired.open', false);
                vscode.commands.executeCommand('setContext', 'dired.wdired', false);
            }
        }
    });

    context.subscriptions.push(
        provider,
        providerRegistration,
        commandOpen,
        commandEnter,
        commandToggleDotFiles,
        commandCreateDir,
        commandCreateFile,
        commandRename,
        commandCopy,
        commandGoUpDir,
        commandRefresh,
        commandClose,
        commandDelete,
        commandSelect,
        commandWdiredCommit,
        commandWdiredAbort,
        commandToggleReadOnly,
        activeEditorHandler,
        documentCloseHandler
    );


    return {
        DiredProvider: provider,
    };
}
