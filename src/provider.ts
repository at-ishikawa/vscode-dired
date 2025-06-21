'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import FileItem from './fileItem';
import * as autoBox from './autocompletedInputBox'

const FIXED_URI: vscode.Uri = vscode.Uri.parse('dired://fixed_window');

export default class DiredProvider implements vscode.TextDocumentContentProvider {
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
    private _virtualDocumentContents: Map<string, string> = new Map(); // Store virtual document contents
    private _wdiredTempFile: string | null = null; // Temp file for wdired mode
    private _diredVirtualUri: vscode.Uri | null = null; // Store the virtual URI for returning to dired

    constructor(fixed_window: boolean) {
        this._fixed_window = fixed_window;
    }

    dispose() {
        this._onDidChange.dispose();
        if (this._documentChangeListener) {
            this._documentChangeListener.dispose();
        }
        this.cleanupTempFiles();
        this._virtualDocumentContents.clear();
    }

    get onDidChange() {
        return this._onDidChange.event;
    }

    provideTextDocumentContent(uri: vscode.Uri): string | undefined {
        return this._virtualDocumentContents.get(uri.toString());
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
        
        // For virtual documents, extract the path from the URI query
        if (doc.uri.scheme === DiredProvider.scheme) {
            const query = doc.uri.query;
            if (query) {
                return decodeURIComponent(query);
            }
        }
        
        // For other documents, parse from the first line
        const line0 = doc.lineAt(0).text;
        const dir = line0.substring(0, line0.length - 1);
        return dir;
    }

    isDiredDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'dired' || document.languageId === 'wdired' ||
               document.uri.scheme === DiredProvider.scheme ||
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
        if (this._wdiredTempFile && fs.existsSync(this._wdiredTempFile)) {
            try {
                fs.unlinkSync(this._wdiredTempFile);
            } catch (error) {
                console.warn('Failed to cleanup wdired temp file:', error);
            }
        }
        this._currentDiredFile = null;
        this._wdiredTempFile = null;
        this._diredDocument = null;
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
        if (!currentDir || !this._diredDocument) {
            return;
        }

        try {
            // Recreate buffer content with latest directory state
            await this.createBuffer(currentDir);

            // Update virtual document content
            const content = this._buffers.join('\n');
            this._virtualDocumentContents.set(this._diredDocument.uri.toString(), content);

            // Trigger content update
            this._onDidChange.fire(this._diredDocument.uri);

            vscode.window.showInformationMessage('Directory refreshed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh directory: ${error}`);
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

    async delete() {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const targetPath = path.join(this.dirname, f.fileName);
            
            try {
                const stat = fs.statSync(targetPath);
                
                if (stat.isDirectory()) {
                    this.deleteDirectoryRecursive(targetPath);
                    vscode.window.showInformationMessage(`Directory ${f.fileName} was deleted`);
                } else {
                    fs.unlinkSync(targetPath);
                    vscode.window.showInformationMessage(`${f.fileName} was deleted`);
                }
                
                this.reload();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete ${f.fileName}: ${error}`);
            }
        }
    }

    private deleteDirectoryRecursive(dirPath: string): void {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                this.deleteDirectoryRecursive(itemPath);
            } else {
                fs.unlinkSync(itemPath);
            }
        }
        
        fs.rmdirSync(dirPath);
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
            
            // Store the current dired URI for returning later
            this._diredVirtualUri = currentEditor.document.uri;

            // Get current content
            const content = this._buffers.join('\n');
            
            // Create a temporary file for wdired mode
            const tempDir = os.tmpdir();
            const dirBasename = path.basename(currentDir) || 'root';
            const timestamp = Date.now();
            // Use a special naming pattern that won't show in explorer
            this._wdiredTempFile = path.join(tempDir, `.wdired-${dirBasename}-${timestamp}`);
            
            // Write content to temp file
            fs.writeFileSync(this._wdiredTempFile, content);
            
            // Open the temp file
            const tempUri = vscode.Uri.file(this._wdiredTempFile);
            const wdiredDoc = await vscode.workspace.openTextDocument(tempUri);

            // Show the document in the same view column
            const viewColumn = currentEditor.viewColumn || vscode.ViewColumn.Active;
            const wdiredEditor = await vscode.window.showTextDocument(wdiredDoc, {
                viewColumn: viewColumn,
                preview: false
            });

            // Set language mode to wdired
            await vscode.languages.setTextDocumentLanguage(wdiredDoc, "wdired");

            // Store reference to the wdired document
            this._diredDocument = wdiredDoc;

            // Set context for keybindings
            vscode.commands.executeCommand('setContext', 'dired.wdired', true);

            vscode.window.showInformationMessage('Entered wdired mode. Edit filenames and press Ctrl+C Ctrl+C to commit or Ctrl+C Ctrl+K to abort.');
        } catch (error) {
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;
            this._diredVirtualUri = null;
            if (this._wdiredTempFile && fs.existsSync(this._wdiredTempFile)) {
                fs.unlinkSync(this._wdiredTempFile);
                this._wdiredTempFile = null;
            }
            vscode.window.showErrorMessage(`Failed to enter wdired mode: ${error}`);
        }
    }

    async exitWdiredMode(commit: boolean = true) {
        if (!this._wdiredMode || !this._diredDocument || !this._wdiredDirectory) {
            return;
        }

        try {
            if (commit) {
                await this.commitWdiredChanges();
            }

            // Get the current view column
            const currentEditor = vscode.window.activeTextEditor;
            const viewColumn = currentEditor?.viewColumn || vscode.ViewColumn.Active;

            // Reset context
            vscode.commands.executeCommand('setContext', 'dired.wdired', false);

            // Close the wdired temp file document without saving
            if (currentEditor && currentEditor.document === this._diredDocument) {
                // First, mark the document as not dirty to avoid save prompt
                await vscode.workspace.saveAll(false); // false = don't include untitled
                await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            }

            // Clean up temp file
            if (this._wdiredTempFile && fs.existsSync(this._wdiredTempFile)) {
                fs.unlinkSync(this._wdiredTempFile);
                this._wdiredTempFile = null;
            }

            // Reopen the dired buffer with updated content
            if (this._diredVirtualUri) {
                // Refresh the virtual document content
                await this.openDirInternal(this._wdiredDirectory);
            } else {
                // Fallback if we don't have the virtual URI
                await this.openDirInternal(this._wdiredDirectory);
            }

            // Reset state
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;
            this._diredVirtualUri = null;

        } catch (error) {
            // Reset state even on error
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredDirectory = null;
            this._diredVirtualUri = null;
            if (this._wdiredTempFile && fs.existsSync(this._wdiredTempFile)) {
                fs.unlinkSync(this._wdiredTempFile);
                this._wdiredTempFile = null;
            }
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

            // Create virtual document URI with directory name as the visible part
            const dirBasename = path.basename(dirPath) || 'root';
            const encodedPath = encodeURIComponent(dirPath);
            // Create a URI that displays nicely in the tab
            const virtualUri = vscode.Uri.parse(`${DiredProvider.scheme}:${dirBasename}?${encodedPath}`);

            // Store content for the virtual document
            const content = this._buffers.join('\n');
            this._virtualDocumentContents.set(virtualUri.toString(), content);

            // Open the virtual document
            const doc = await vscode.workspace.openTextDocument(virtualUri);
            this._diredDocument = doc;

            // Show the document
            const viewColumn = this._fixed_window ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
            
            const editor = await vscode.window.showTextDocument(doc, {
                preview: this._fixed_window,
                viewColumn: viewColumn
            });

            // Set language mode to dired
            await vscode.languages.setTextDocumentLanguage(doc, "dired");

            // Trigger content update event
            this._onDidChange.fire(virtualUri);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open directory: ${error}`);
        }
    }

    async showFile(uri: vscode.Uri) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, this.getTextDocumentShowOptions(false));
        } catch (err) {
            vscode.window.showErrorMessage(`Could not open file ${uri.fsPath}: ${err}`);
        }
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
        
        // Update virtual document content
        if (this._diredDocument && this._diredDocument.uri.scheme === DiredProvider.scheme) {
            const content = this._buffers.join('\n');
            this._virtualDocumentContents.set(this._diredDocument.uri.toString(), content);
            this._onDidChange.fire(this._diredDocument.uri);
        }
    }

    private getTextDocumentShowOptions(fixed_window: boolean): vscode.TextDocumentShowOptions {
        const opts: vscode.TextDocumentShowOptions = {
            preview: fixed_window,
            viewColumn: vscode.ViewColumn.Active
        };
        return opts;
    }
}
