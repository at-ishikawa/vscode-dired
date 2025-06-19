'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import FileItem from './fileItem';
import * as autoBox from './autocompletedInputBox'

const FIXED_URI: vscode.Uri = vscode.Uri.parse('dired://fixed_window');

export default class DiredProvider {
    static scheme = 'dired'; // ex: dired://<directory>

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _fixed_window: boolean;
    private _show_dot_files: boolean = true;
    private _buffers: string[]; // This is a temporary buffer. Reused by multiple tabs.
    private _directoryHistory: string[] = []; // Track directory history for back navigation
    private _wdiredMode: boolean = false; // Track if in wdired edit mode
    private _originalBuffers: string[] = []; // Store original buffer content for revert
    private _wdiredDirectory: string | null = null; // Store directory path for wdired mode
    private _currentDiredFile: string | null = null; // Current dired temp file
    private _diredDocument: vscode.TextDocument | null = null; // Current dired document
    private _documentChangeListener: vscode.Disposable | null = null; // Document change listener

    constructor(fixed_window: boolean) {
        this._fixed_window = fixed_window;
    }

    dispose() {
        this._onDidChange.dispose();
        if (this._documentChangeListener) {
            this._documentChangeListener.dispose();
        }
        this.cleanupTempFiles();
    }

    get onDidChange() {
        return this._onDidChange.event;
    }

    get dirname() {
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return undefined;
        }
        const doc = at.document;
        if (!doc || !this.isDiredDocument(doc)) {
            return undefined;
        }
        const line0 = doc.lineAt(0).text;
        const dir = line0.substring(0, line0.length - 1);
        return dir;
    }

    isDiredDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'dired' || document.languageId === 'wdired' ||
               (this._currentDiredFile !== null && document.uri.fsPath === this._currentDiredFile);
    }

    isWdiredMode(document: vscode.TextDocument): boolean {
        return this._wdiredMode && this.isDiredDocument(document);
    }

    cleanupTempFiles() {
        if (this._currentDiredFile && fs.existsSync(this._currentDiredFile)) {
            try {
                fs.unlinkSync(this._currentDiredFile);
            } catch (error) {
                console.warn('Failed to cleanup dired temp file:', error);
            }
        }
        this._currentDiredFile = null;
        this._diredDocument = null;
    }

    setupDocumentChangeListener() {
        if (this._documentChangeListener) {
            this._documentChangeListener.dispose();
        }

        this._documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (!this.isDiredDocument(event.document)) {
                return;
            }

            // Allow changes in wdired mode
            if (this._wdiredMode) {
                return;
            }

            // Prevent changes in dired mode
            if (event.contentChanges.length > 0) {
                vscode.window.showWarningMessage('Buffer is read-only. Use wdired mode (Ctrl+C Ctrl+E) to edit filenames.');

                // Revert all changes by restoring original content
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    event.document.positionAt(0),
                    event.document.positionAt(event.document.getText().length)
                );

                // Restore from the current buffer content
                const originalContent = this._buffers.join('\n');
                edit.replace(event.document.uri, fullRange, originalContent);
                await vscode.workspace.applyEdit(edit);
            }
        });
    }

    toggleDotFiles() {
        this._show_dot_files = !this._show_dot_files;
        this.reload();
    }

    enter() {
        const f = this.getFile();
        if (!f) {
            return;
        }
        const uri = f.uri;
        if (!uri) {
            return;
        }
        if (uri.scheme !== DiredProvider.scheme) {
            this.showFile(uri);
            return;
        }
        this.openDir(f.path);
    }

    async reload() {
        const currentDir = this.dirname;
        if (!currentDir || !this._diredDocument || !this._currentDiredFile) {
            return;
        }

        try {
            // Recreate buffer content with latest directory state
            await this.createBuffer(currentDir);

            // Update the temp file with new content
            const content = this._buffers.join('\n');
            fs.writeFileSync(this._currentDiredFile, content);

            // Update the document content
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                this._diredDocument.positionAt(0),
                this._diredDocument.positionAt(this._diredDocument.getText().length)
            );
            edit.replace(this._diredDocument.uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);

            vscode.window.showInformationMessage('Directory refreshed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh directory: ${error}`);
        }
    }

    async reloadCurrentBuffer() {
        if (!this._diredDocument || !this._wdiredDirectory) {
            return;
        }

        try {
            // Recreate buffer content
            await this.createBuffer(this._wdiredDirectory);

            // Update the current file content
            if (this._currentDiredFile) {
                const content = this._buffers.join('\n');
                fs.writeFileSync(this._currentDiredFile, content);

                // Trigger document reload
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    this._diredDocument.positionAt(0),
                    this._diredDocument.positionAt(this._diredDocument.getText().length)
                );
                edit.replace(this._diredDocument.uri, fullRange, content);
                await vscode.workspace.applyEdit(edit);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reload buffer: ${error}`);
        }
    }

    async createDir(dirname: string) {
        if (this.dirname) {
            const p = path.join(this.dirname, dirname);
            let uri = vscode.Uri.file(p);
            await vscode.workspace.fs.createDirectory(uri);
            this.reload();
        }
    }

    async createFile(filename: string) {
        const uri = vscode.Uri.file(filename);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
        this.reload();
    }

    async rename(newPath: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const oldPath = path.join(this.dirname, f.fileName);

            try {
                // Handle absolute vs relative paths
                let targetPath: string;
                if (path.isAbsolute(newPath)) {
                    targetPath = newPath;
                } else {
                    targetPath = path.join(this.dirname, newPath);
                }
                let newFileName = path.basename(targetPath);
                // check if this file is a directory
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                    targetPath = path.join(targetPath, f.fileName)
                    newFileName = f.fileName;
                }

                // Create target directory if it doesn't exist
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                fs.renameSync(oldPath, targetPath);

                if (f.fileName == newFileName) {
                    vscode.window.showInformationMessage(`${f.fileName} moved to ${targetPath}`);
                } else {
                    vscode.window.showInformationMessage(`${f.fileName} renamed to ${newFileName}`);
                }

                this.reload();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to rename/move ${f.fileName}: ${error}`);
            }
        }
    }

    async copy(newPath: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const oldPath = path.join(this.dirname, f.fileName);

            try {
                // Handle absolute vs relative paths
                let targetPath: string;
                if (path.isAbsolute(newPath)) {
                    targetPath = newPath;
                } else {
                    targetPath = path.join(this.dirname, newPath);
                }
                
                let newFileName = path.basename(targetPath);
                // Check if target path is an existing directory
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                    targetPath = path.join(targetPath, f.fileName);
                    newFileName = f.fileName;
                }

                // Create target directory if it doesn't exist
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // Check if source is directory or file and copy accordingly
                const sourceStat = fs.statSync(oldPath);
                if (sourceStat.isDirectory()) {
                    await this.copyDirectory(oldPath, targetPath);
                } else {
                    fs.copyFileSync(oldPath, targetPath);
                }

                if (f.fileName === newFileName) {
                    vscode.window.showInformationMessage(`${f.fileName} copied to ${targetPath}`);
                } else {
                    vscode.window.showInformationMessage(`${f.fileName} copied as ${newFileName}`);
                }

                this.reload();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy ${f.fileName}: ${error}`);
            }
        }
    }

    private async copyDirectory(source: string, target: string): Promise<void> {
        // Create target directory
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }

        // Read directory contents
        const items = fs.readdirSync(source);
        
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const targetPath = path.join(target, item);
            const stat = fs.statSync(sourcePath);

            if (stat.isDirectory()) {
                await this.copyDirectory(sourcePath, targetPath);
            } else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    delete() {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const n = path.join(this.dirname, f.fileName);
            fs.unlinkSync(n);
            this.reload();
            vscode.window.showInformationMessage(`${n} was deleted`);
        }
    }

    select() {
        this.selectFiles(true);
    }

    unselect() {
        this.selectFiles(false);
    }

    goUpDir() {
        if (!this.dirname || this.dirname === "/") {
            return;
        }
        const p = path.join(this.dirname, "..");
        this.openDir(p);
    }

    goBackDir() {
        if (this._directoryHistory.length === 0) {
            vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            return;
        }
        const previousDir = this._directoryHistory.pop();
        if (previousDir) {
            // Use openDir without adding to history since we're going back
            const currentDir = this.dirname;
            this.openDirWithoutHistory(previousDir);
        }
    }

    async enterWdiredMode() {
        if (this._wdiredMode) {
            return;
        }

        // Store the current directory and state
        const currentDir = this.dirname;
        if (!currentDir) {
            vscode.window.showErrorMessage('No active dired directory found');
            return;
        }

        const currentEditor = vscode.window.activeTextEditor;
        if (!currentEditor || !this.isDiredDocument(currentEditor.document)) {
            vscode.window.showErrorMessage('No active dired buffer found');
            return;
        }

        try {
            this._wdiredDirectory = currentDir;
            this._originalBuffers = [...this._buffers];
            this._wdiredMode = true;

            // Change language mode to wdired for syntax highlighting
            await vscode.languages.setTextDocumentLanguage(currentEditor.document, "wdired");

            // Set context for keybindings
            vscode.commands.executeCommand('setContext', 'dired.wdired', true);

            vscode.window.showInformationMessage('Entered wdired mode. Edit filenames and press Ctrl+C Ctrl+C to commit or Ctrl+C Ctrl+K to abort.');
        } catch (error) {
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;
            vscode.window.showErrorMessage(`Failed to enter wdired mode: ${error}`);
        }
    }

    async exitWdiredMode(commit: boolean = true) {
        if (!this._wdiredMode || !this._diredDocument) {
            return;
        }

        try {
            if (commit) {
                await this.commitWdiredChanges();
            }

            // Reset context and language mode
            vscode.commands.executeCommand('setContext', 'dired.wdired', false);
            await vscode.languages.setTextDocumentLanguage(this._diredDocument, "dired");

            // Reload buffer content if changes were committed
            if (commit) {
                await this.reloadCurrentBuffer();
            }

            // Reset state
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;

        } catch (error) {
            // Reset state even on error
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;
            vscode.commands.executeCommand('setContext', 'dired.wdired', false);
            vscode.window.showErrorMessage(`Error exiting wdired mode: ${error}`);
        }
    }

    async toggleReadOnly() {
        if (this._wdiredMode) {
            // Exit wdired mode and commit changes (like Emacs behavior)
            await this.exitWdiredMode(true);
            vscode.window.showInformationMessage('Exited wdired mode (changes committed)');
        } else {
            // Enter wdired mode
            await this.enterWdiredMode();
        }
    }

    async commitWdiredChanges() {
        if (!this._wdiredDirectory || !this._diredDocument) {
            vscode.window.showErrorMessage('No wdired directory or document found');
            return;
        }

        try {
            // Get current document content
            const currentLines: string[] = [];
            for (let i = 0; i < this._diredDocument.lineCount; i++) {
                currentLines.push(this._diredDocument.lineAt(i).text);
            }

            const renames: { oldPath: string, newPath: string }[] = [];

            for (let i = 1; i < Math.min(this._originalBuffers.length, currentLines.length); i++) {
                const originalLine = this._originalBuffers[i];
                const currentLine = currentLines[i];

                if (originalLine !== currentLine) {
                    const originalFilename = originalLine.substring(52);
                    const currentFilename = currentLine.substring(52);

                    if (originalFilename !== currentFilename && originalFilename !== '.' && originalFilename !== '..') {
                        const oldPath = path.join(this._wdiredDirectory, originalFilename);
                        const newPath = path.join(this._wdiredDirectory, currentFilename);
                        renames.push({ oldPath, newPath });
                    }
                }
            }

            let errorCount = 0;
            for (const { oldPath, newPath } of renames) {
                try {
                    fs.renameSync(oldPath, newPath);
                } catch (error) {
                    errorCount++;
                    vscode.window.showErrorMessage(`Failed to rename ${path.basename(oldPath)}: ${error}`);
                }
            }

            if (renames.length > 0) {
                vscode.window.showInformationMessage(`Wdired: ${renames.length - errorCount} file(s) renamed successfully`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading wdired changes: ${error}`);
        }
    }

    async openDir(dirPath: string) {
        const currentDir = this.dirname;
        if (currentDir && currentDir !== dirPath) {
            this._directoryHistory.push(currentDir);
        }

        await this.openDirInternal(dirPath);
    }

    async openDirWithoutHistory(dirPath: string) {
        await this.openDirInternal(dirPath);
    }

    private async openDirInternal(dirPath: string) {
        try {
            // Cleanup previous temp file
            this.cleanupTempFiles();

            // Create buffer content
            await this.createBuffer(dirPath);

            // Create temporary file for this directory
            const tempDir = os.tmpdir();
            const dirBasename = path.basename(dirPath);
            const timestamp = Date.now();
            this._currentDiredFile = path.join(tempDir, `.dired-${dirBasename}-${timestamp}.txt`);

            // Write content to temp file
            const content = this._buffers.join('\n');
            fs.writeFileSync(this._currentDiredFile, content);

            // Open the temp file
            const tempUri = vscode.Uri.file(this._currentDiredFile);
            const doc = await vscode.workspace.openTextDocument(tempUri);
            this._diredDocument = doc;

            // Show the document
            await vscode.window.showTextDocument(doc, this.getTextDocumentShowOptions(true));

            // Set language mode and setup protection
            await vscode.languages.setTextDocumentLanguage(doc, "dired");
            this.setupDocumentChangeListener();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open directory: ${error}`);
        }
    }

    showFile(uri: vscode.Uri) {
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc, this.getTextDocumentShowOptions(false));
        });
        // TODO: show warning when open file failed
        // vscode.window.showErrorMessage(`Could not open file ${uri.fsPath}: ${err}`);
    }


    private createBuffer(dirname: string): Thenable<string[]> {
        return new Promise((resolve) => {
            let files: FileItem[] = [];
            if (fs.statSync(dirname).isDirectory()) {
                try {
                    files = this.readDir(dirname);
                } catch (err) {
                    vscode.window.showErrorMessage(`Could not read ${dirname}: ${err}`);
                }
            }

            this._buffers = [
                dirname + ":", // header line
            ];
            this._buffers = this._buffers.concat(files.map((f) => f.line()));

            resolve(this._buffers);
        });
    }

    private readDir(dirname: string): FileItem[] {
        const files = [".", ".."].concat(fs.readdirSync(dirname));
        return <FileItem[]>files.map((filename) => {
            const p = path.join(dirname, filename);
            try {
                const stat = fs.statSync(p);
                return FileItem.create(dirname, filename, stat);
            } catch (err) {
                vscode.window.showErrorMessage(`Could not get stat of ${p}: ${err}`);
                return null;
            }
        }).filter((fileItem) => {
            if (fileItem) {
                if (this._show_dot_files) return true;
                let filename = fileItem.fileName;
                if (filename == '..' || filename == '.') return true;
                return filename.substring(0, 1) != '.';
            } else {
                return false;
            }
        });
    }

    public getFile(): FileItem | null {
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return null;
        }
        const cursor = at.selection.active;
        if (cursor.line < 1) {
            return null;
        }
        const lineText = at.document.lineAt(cursor.line);
        if (this.dirname && lineText) {
            return FileItem.parseLine(this.dirname, lineText.text);
        }
        return null;
    }

    private selectFiles(value: boolean) {
        if (!this.dirname) {
            return;
        }
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return;
        }
        const doc = at.document;
        if (!doc) {
            return;
        }
        this._buffers = [];
        for (let i = 0; i < doc.lineCount; i++) {
            this._buffers.push(doc.lineAt(i).text);
        }

        let start = 0;
        let end = 0;
        let allowSelectDot = false; // Want to copy emacs's behavior exactly

        if (at.selection.isEmpty) {
            const cursor = at.selection.active;
            if (cursor.line === 0) { // Select all
                start = 1;
                end = doc.lineCount;
            } else {
                allowSelectDot = true;
                start = cursor.line;
                end = cursor.line + 1;
                vscode.commands.executeCommand("cursorMove", { to: "down", by: "line" });
            }
        } else {
            start = at.selection.start.line;
            end = at.selection.end.line;
        }

        for (let i = start; i < end; i++) {
            const f = FileItem.parseLine(this.dirname, this._buffers[i]);
            if (f.fileName === "." || f.fileName === "..") {
                if (!allowSelectDot) {
                    continue;
                }
            }
            f.select(value);
            this._buffers[i] = f.line();
        }
        this._onDidChange.fire(this._diredDocument?.uri || vscode.Uri.parse(''));
    }

    private getTextDocumentShowOptions(fixed_window: boolean): vscode.TextDocumentShowOptions {
        const opts: vscode.TextDocumentShowOptions = {
            preview: fixed_window,
            viewColumn: vscode.ViewColumn.Active
        };
        return opts;
    }
}
