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
    private _wdiredTempFile: string | null = null; // Temporary file for wdired editing
    private _wdiredDirectory: string | null = null; // Store directory path for wdired mode

    constructor(fixed_window: boolean) {
        this._fixed_window = fixed_window;
    }

    dispose() {
        this._onDidChange.dispose();
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
        if (!doc) {
            return undefined;
        }
        const line0 = doc.lineAt(0).text;
        const dir = line0.substring(0, line0.length - 1);
        return dir;
    }

    isWdiredTempFile(document: vscode.TextDocument): boolean {
        return this._wdiredTempFile !== null && 
               document.uri.fsPath === this._wdiredTempFile;
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

    reload() {
        if (!this.dirname) {
            return;
        }
        this.createBuffer(this.dirname)
            .then(() => this._onDidChange.fire(this.uri));
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

    rename(newName: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const n = path.join(this.dirname, newName);
            this.reload();
            vscode.window.showInformationMessage(`${f.fileName} is renamed to ${n}`);
        }
    }

    copy(newName: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const n = path.join(this.dirname, newName);
            vscode.window.showInformationMessage(`${f.fileName} is copied to ${n}`);
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
            const f = new FileItem(previousDir, "", true);
            const uri = f.uri;
            if (uri) {
                this.createBuffer(previousDir)
                    .then(() => vscode.workspace.openTextDocument(uri))
                    .then(doc => {
                        vscode.window.showTextDocument(
                            doc,
                            this.getTextDocumentShowOptions(true)
                        );
                        vscode.languages.setTextDocumentLanguage(doc, "dired");
                    }
                    );
            }
        }
    }

    async enterWdiredMode() {
        if (this._wdiredMode) {
            return;
        }
        
        // Store the current directory before switching to temp file
        const currentDir = this.dirname;
        if (!currentDir) {
            vscode.window.showErrorMessage('No active dired directory found');
            return;
        }
        this._wdiredDirectory = currentDir;
        
        try {
            // Create temporary file for editing
            const tempDir = os.tmpdir();
            this._wdiredTempFile = path.join(tempDir, `wdired-${Date.now()}.txt`);
            
            // Write current buffer content to temp file
            const content = this._buffers.join('\n');
            fs.writeFileSync(this._wdiredTempFile, content);
            
            // Store original state
            this._wdiredMode = true;
            this._originalBuffers = [...this._buffers];
            vscode.commands.executeCommand('setContext', 'dired.wdired', true);
            
            // Open temp file for editing
            const tempUri = vscode.Uri.file(this._wdiredTempFile);
            const document = await vscode.workspace.openTextDocument(tempUri);
            await vscode.window.showTextDocument(document, { preview: false });
            
            // Set the wdired language mode for syntax highlighting
            await vscode.languages.setTextDocumentLanguage(document, "wdired");
            
            vscode.window.showInformationMessage('Entered wdired mode. Edit filenames and press Ctrl+C Ctrl+C to commit or Ctrl+C Ctrl+K to abort.');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to enter wdired mode: ${error}`);
        }
    }

    async exitWdiredMode(commit: boolean = true) {
        if (!this._wdiredMode || !this._wdiredTempFile) {
            return;
        }
        
        try {
            if (commit) {
                await this.commitWdiredChanges();
            }
            
            // Close the temp file if it's open
            if (this._wdiredTempFile) {
                const tempUri = vscode.Uri.file(this._wdiredTempFile);
                await vscode.commands.executeCommand('workbench.action.closeEditorsInGroup');
            }
            
            // Clean up temp file
            if (fs.existsSync(this._wdiredTempFile)) {
                fs.unlinkSync(this._wdiredTempFile);
            }
            
            // Reset state
            this._wdiredMode = false;
            this._originalBuffers = [];
            this._wdiredTempFile = null;
            this._wdiredDirectory = null;
            vscode.commands.executeCommand('setContext', 'dired.wdired', false);
            
            // Reload and show the dired buffer
            await this.reload();
            const diredUri = this.uri;
            const document = await vscode.workspace.openTextDocument(diredUri);
            await vscode.window.showTextDocument(document, this.getTextDocumentShowOptions(true));
            
        } catch (error) {
            vscode.window.showErrorMessage(`Error exiting wdired mode: ${error}`);
        }
    }

    async commitWdiredChanges() {
        if (!this._wdiredDirectory || !this._wdiredTempFile) {
            vscode.window.showErrorMessage('No wdired directory or temp file found');
            return;
        }

        try {
            // First, save the temp file if it's open in an editor
            const tempUri = vscode.Uri.file(this._wdiredTempFile);
            const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === tempUri.toString());
            if (openDoc && openDoc.isDirty) {
                await openDoc.save();
            }
            
            // Read the edited content from temp file
            const editedContent = fs.readFileSync(this._wdiredTempFile, 'utf8');
            const currentLines = editedContent.split('\n');

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

    openDir(path: string) {
        const currentDir = this.dirname;
        if (currentDir && currentDir !== path) {
            this._directoryHistory.push(currentDir);
        }
        
        const f = new FileItem(path, "", true); // Incomplete FileItem just to get URI.
        const uri = f.uri;
        if (uri) {
            this.createBuffer(path)
                .then(() => vscode.workspace.openTextDocument(uri))
                .then(doc => {
                    vscode.window.showTextDocument(
                        doc,
                        this.getTextDocumentShowOptions(true)
                    );
                    vscode.languages.setTextDocumentLanguage(doc, "dired");
                }
                );
        }
    }

    showFile(uri: vscode.Uri) {
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc, this.getTextDocumentShowOptions(false));
        });
        // TODO: show warning when open file failed
        // vscode.window.showErrorMessage(`Could not open file ${uri.fsPath}: ${err}`);
    }

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        return this.render();
    }

    private get uri(): vscode.Uri {
        if (this.dirname) {
            const f = new FileItem(this.dirname, "", true); // Incomplete FileItem just to get URI.
            const uri = f.uri;
            if (uri) {
                return uri;
            }
        }
        return FIXED_URI;
    }

    private render(): Thenable<string> {
        return new Promise((resolve) => {
            resolve(this._buffers.join('\n'));
        });
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

    private getFile(): FileItem | null {
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
        const uri = this.uri;
        this._onDidChange.fire(uri);
    }

    private getTextDocumentShowOptions(fixed_window: boolean): vscode.TextDocumentShowOptions {
        const opts: vscode.TextDocumentShowOptions = {
            preview: fixed_window,
            viewColumn: vscode.ViewColumn.Active
        };
        return opts;
    }
}
