//
// Core logic tests that don't depend on VSCode
//

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test core utility functions
describe("Core Utility Tests", () => {
    
    it("should pad numbers correctly", () => {
        function pad(num: number, size: number, p: string): string {
            var s = num + "";
            while (s.length < size) s = p + s;
            return s;
        }
        
        // Test padding with spaces
        assert.strictEqual(pad(123, 5, " "), "  123");
        assert.strictEqual(pad(12345, 5, " "), "12345");
        assert.strictEqual(pad(123456, 5, " "), "123456");
        
        // Test padding with zeros
        assert.strictEqual(pad(5, 3, "0"), "005");
        assert.strictEqual(pad(50, 3, "0"), "050");
        assert.strictEqual(pad(500, 3, "0"), "500");
    });

    it("should parse line format correctly", () => {
        function parseFilenameFromLine(line: string): string {
            return line.substring(51);
        }
        
        function parseSelectionFromLine(line: string): boolean {
            return line.substring(0, 1) === "*";
        }
        
        function parseModeFromLine(line: string): string {
            return line.substring(2, 12);
        }
        
        const testLine = "* -rw-r--r-- user     group       1024 12 25 14:30 testfile.txt";
        
        assert.strictEqual(parseFilenameFromLine(testLine), "testfile.txt");
        assert.strictEqual(parseSelectionFromLine(testLine), true);
        assert.strictEqual(parseModeFromLine(testLine), "-rw-r--r--");
        
        const unselectedLine = "  drwxr-xr-x user     group       4096 12 25 14:30 directory";
        assert.strictEqual(parseFilenameFromLine(unselectedLine), "directory");
        assert.strictEqual(parseSelectionFromLine(unselectedLine), false);
        assert.strictEqual(parseModeFromLine(unselectedLine), "drwxr-xr-x");
    });

    it("should format lines correctly", () => {
        function formatLine(
            selected: boolean,
            mode: string,
            user: string,
            group: string,
            size: number,
            month: number,
            day: number,
            hour: number,
            min: number,
            filename: string
        ): string {
            function pad(num: number, size: number, p: string): string {
                var s = num + "";
                while (s.length < size) s = p + s;
                return s;
            }
            
            const u = (user + "        ").substring(0, 8);
            const g = (group + "        ").substring(0, 8);
            const sizeStr = pad(size, 8, " ");
            const monthStr = pad(month, 2, "0");
            const dayStr = pad(day, 2, "0");
            const hourStr = pad(hour, 2, "0");
            const minStr = pad(min, 2, "0");
            const se = selected ? "*" : " ";
            
            return `${se} ${mode} ${u} ${g} ${sizeStr} ${monthStr} ${dayStr} ${hourStr}:${minStr} ${filename}`;
        }
        
        const line = formatLine(true, "-rw-r--r--", "user", "group", 1024, 12, 25, 14, 30, "testfile.txt");
        
        assert.ok(line.includes("testfile.txt"));
        assert.ok(line.includes("-rw-r--r--"));
        assert.ok(line.includes("user"));
        assert.ok(line.includes("group"));
        assert.ok(line.includes("1024"));
        assert.ok(line.includes("12"));
        assert.ok(line.includes("25"));
        assert.ok(line.includes("14:30"));
        assert.ok(line.startsWith("*"));
    });

    it("should handle directory path utilities correctly", () => {
        function isDotFile(filename: string): boolean {
            return filename.startsWith('.') && filename !== '.' && filename !== '..';
        }
        
        function isSpecialDir(filename: string): boolean {
            return filename === '.' || filename === '..';
        }
        
        assert.strictEqual(isDotFile('.hidden'), true);
        assert.strictEqual(isDotFile('.gitignore'), true);
        assert.strictEqual(isDotFile('normal.txt'), false);
        assert.strictEqual(isDotFile('.'), false);
        assert.strictEqual(isDotFile('..'), false);
        
        assert.strictEqual(isSpecialDir('.'), true);
        assert.strictEqual(isSpecialDir('..'), true);
        assert.strictEqual(isSpecialDir('.hidden'), false);
        assert.strictEqual(isSpecialDir('normal'), false);
    });

    it("should validate filenames correctly", () => {
        function isValidFilename(filename: string): boolean {
            // Basic filename validation
            if (!filename || filename.length === 0) return false;
            if (filename.includes('/')) return false;
            if (filename.includes('\0')) return false;
            return true;
        }
        
        assert.strictEqual(isValidFilename('valid.txt'), true);
        assert.strictEqual(isValidFilename('also_valid-123.txt'), true);
        assert.strictEqual(isValidFilename(''), false);
        assert.strictEqual(isValidFilename('invalid/path.txt'), false);
        assert.strictEqual(isValidFilename('invalid\0null.txt'), false);
    });
});

describe("File System Integration Tests", () => {
    let tempDir: string;
    let testFiles: string[];

    beforeEach(() => {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-dired-test-'));
        testFiles = [];
        
        // Create some test files
        const testFile1 = path.join(tempDir, 'test1.txt');
        const testFile2 = path.join(tempDir, 'test2.md');
        const testDir = path.join(tempDir, 'subdir');
        const dotFile = path.join(tempDir, '.hidden');
        
        fs.writeFileSync(testFile1, 'Hello World');
        fs.writeFileSync(testFile2, '# Test Markdown');
        fs.writeFileSync(dotFile, 'hidden content');
        fs.mkdirSync(testDir);
        
        testFiles.push(testFile1, testFile2, testDir, dotFile);
    });

    afterEach(() => {
        // Clean up test files
        testFiles.forEach(file => {
            try {
                if (fs.existsSync(file)) {
                    if (fs.statSync(file).isDirectory()) {
                        fs.rmdirSync(file);
                    } else {
                        fs.unlinkSync(file);
                    }
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        });
        
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmdirSync(tempDir);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    it("should read directory contents", () => {
        const files = fs.readdirSync(tempDir);
        
        assert.ok(files.includes('test1.txt'));
        assert.ok(files.includes('test2.md'));
        assert.ok(files.includes('subdir'));
        assert.ok(files.includes('.hidden'));
    });

    it("should access file stat information", () => {
        const testFile = path.join(tempDir, 'test1.txt');
        const testDir = path.join(tempDir, 'subdir');
        
        const fileStats = fs.statSync(testFile);
        const dirStats = fs.statSync(testDir);
        
        assert.strictEqual(fileStats.isFile(), true);
        assert.strictEqual(fileStats.isDirectory(), false);
        assert.strictEqual(dirStats.isFile(), false);
        assert.strictEqual(dirStats.isDirectory(), true);
    });

    it("should rename files", () => {
        const originalFile = path.join(tempDir, 'test1.txt');
        const newFile = path.join(tempDir, 'renamed.txt');
        
        assert.ok(fs.existsSync(originalFile));
        assert.ok(!fs.existsSync(newFile));
        
        fs.renameSync(originalFile, newFile);
        
        assert.ok(!fs.existsSync(originalFile));
        assert.ok(fs.existsSync(newFile));
        
        // Rename back for cleanup
        fs.renameSync(newFile, originalFile);
    });

    it("should rename files with dired provider logic", () => {
        // Simulate the DiredProvider rename logic
        function simulateRename(dirname: string, oldFileName: string, newFileName: string): { success: boolean, error?: string } {
            try {
                const oldPath = path.join(dirname, oldFileName);
                const newPath = path.join(dirname, newFileName);
                
                if (!fs.existsSync(oldPath)) {
                    return { success: false, error: `File ${oldFileName} does not exist` };
                }
                
                if (fs.existsSync(newPath)) {
                    return { success: false, error: `File ${newFileName} already exists` };
                }
                
                fs.renameSync(oldPath, newPath);
                return { success: true };
            } catch (error) {
                return { success: false, error: `Failed to rename: ${error}` };
            }
        }

        // Test successful rename
        const result1 = simulateRename(tempDir, 'test1.txt', 'renamed1.txt');
        assert.strictEqual(result1.success, true);
        assert.ok(fs.existsSync(path.join(tempDir, 'renamed1.txt')));
        assert.ok(!fs.existsSync(path.join(tempDir, 'test1.txt')));

        // Test renaming non-existent file
        const result2 = simulateRename(tempDir, 'nonexistent.txt', 'newname.txt');
        assert.strictEqual(result2.success, false);
        assert.ok(result2.error?.includes('does not exist'));

        // Test renaming to existing file name
        const result3 = simulateRename(tempDir, 'test2.md', 'renamed1.txt');
        assert.strictEqual(result3.success, false);
        assert.ok(result3.error?.includes('already exists'));

        // Test directory rename
        const result4 = simulateRename(tempDir, 'subdir', 'renamed_dir');
        assert.strictEqual(result4.success, true);
        assert.ok(fs.existsSync(path.join(tempDir, 'renamed_dir')));
        assert.ok(!fs.existsSync(path.join(tempDir, 'subdir')));

        // Clean up for other tests - rename files back
        fs.renameSync(path.join(tempDir, 'renamed1.txt'), path.join(tempDir, 'test1.txt'));
        fs.renameSync(path.join(tempDir, 'renamed_dir'), path.join(tempDir, 'subdir'));
    });

    it("should move files to different directories with updated dired provider logic", () => {
        // Simulate the updated DiredProvider rename logic with directory detection
        function simulateUpdatedRename(currentDir: string, fileName: string, newPath: string): { success: boolean, message?: string, error?: string } {
            try {
                const oldPath = path.join(currentDir, fileName);
                
                if (!fs.existsSync(oldPath)) {
                    return { success: false, error: `File ${fileName} does not exist` };
                }
                
                // Handle absolute vs relative paths (matches provider logic)
                let targetPath: string;
                if (path.isAbsolute(newPath)) {
                    targetPath = newPath;
                } else {
                    targetPath = path.join(currentDir, newPath);
                }
                
                let newFileName = path.basename(targetPath);
                // New logic: check if target path is an existing directory
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                    targetPath = path.join(targetPath, fileName);
                    newFileName = fileName;
                }
                
                // Create target directory if it doesn't exist
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                fs.renameSync(oldPath, targetPath);
                
                // Updated messaging logic: compare filename, not directory
                if (fileName === newFileName) {
                    return { success: true, message: `${fileName} moved to ${targetPath}` };
                } else {
                    return { success: true, message: `${fileName} renamed to ${newFileName}` };
                }
            } catch (error) {
                return { success: false, error: `Failed to rename/move: ${error}` };
            }
        }

        // Create a subdirectory for testing moves
        const moveTestDir = path.join(tempDir, 'move_test');
        fs.mkdirSync(moveTestDir);

        // Test 1: Move file to existing directory (preserves filename)
        const result1 = simulateUpdatedRename(tempDir, 'test1.txt', 'move_test');
        assert.strictEqual(result1.success, true);
        assert.ok(result1.message?.includes('moved to'));
        assert.ok(fs.existsSync(path.join(moveTestDir, 'test1.txt'))); // Same filename preserved
        assert.ok(!fs.existsSync(path.join(tempDir, 'test1.txt')));

        // Test 2: Move file to subdirectory with new name
        const result2 = simulateUpdatedRename(tempDir, 'test2.md', 'move_test/newname.md');
        assert.strictEqual(result2.success, true);
        assert.ok(result2.message?.includes('renamed to'));
        assert.ok(fs.existsSync(path.join(moveTestDir, 'newname.md')));
        assert.ok(!fs.existsSync(path.join(tempDir, 'test2.md')));

        // Test 3: Rename file in same directory
        const result3 = simulateUpdatedRename(tempDir, '.hidden', 'visible.txt');
        assert.strictEqual(result3.success, true);
        assert.ok(result3.message?.includes('renamed to'));
        assert.ok(fs.existsSync(path.join(tempDir, 'visible.txt')));
        assert.ok(!fs.existsSync(path.join(tempDir, '.hidden')));

        // Test 4: Move directory to non-existent parent directory
        const result4 = simulateUpdatedRename(tempDir, 'subdir', 'new_parent/subdir');
        assert.strictEqual(result4.success, true);
        assert.ok(result4.message?.includes('moved to'));
        assert.ok(fs.existsSync(path.join(tempDir, 'new_parent', 'subdir')));
        assert.ok(!fs.existsSync(path.join(tempDir, 'subdir')));

        // Test 5: Try to move non-existent file
        const result5 = simulateUpdatedRename(tempDir, 'nonexistent.txt', 'anywhere.txt');
        assert.strictEqual(result5.success, false);
        assert.ok(result5.error?.includes('does not exist'));

        // Clean up - restore files for other tests
        fs.renameSync(path.join(moveTestDir, 'test1.txt'), path.join(tempDir, 'test1.txt'));
        fs.renameSync(path.join(moveTestDir, 'newname.md'), path.join(tempDir, 'test2.md'));
        fs.renameSync(path.join(tempDir, 'visible.txt'), path.join(tempDir, '.hidden'));
        fs.renameSync(path.join(tempDir, 'new_parent', 'subdir'), path.join(tempDir, 'subdir'));
        
        // Remove created directories
        fs.rmdirSync(path.join(tempDir, 'new_parent'));
        fs.rmdirSync(moveTestDir);
    });

    it("should handle directory detection behavior correctly", () => {
        // Test the specific new feature: when target is an existing directory, append original filename
        function simulateDirectoryDetectionBehavior(currentDir: string, fileName: string, newPath: string): { targetPath: string, newFileName: string } {
            // Create a test file first
            const testFile = path.join(currentDir, fileName);
            if (!fs.existsSync(testFile)) {
                fs.writeFileSync(testFile, 'test content');
            }
            
            // Replicate the exact logic from the updated provider
            let targetPath: string;
            if (path.isAbsolute(newPath)) {
                targetPath = newPath;
            } else {
                targetPath = path.join(currentDir, newPath);
            }
            
            let newFileName = path.basename(targetPath);
            // Check if target path is an existing directory
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                targetPath = path.join(targetPath, fileName);
                newFileName = fileName;
            }
            
            return { targetPath, newFileName };
        }

        // Create test directories
        const testDestDir = path.join(tempDir, 'destination');
        fs.mkdirSync(testDestDir);

        // Test 1: Target is existing directory - should append original filename
        const result1 = simulateDirectoryDetectionBehavior(tempDir, 'myfile.txt', 'destination');
        assert.strictEqual(path.basename(result1.targetPath), 'myfile.txt');
        assert.strictEqual(result1.newFileName, 'myfile.txt');
        assert.ok(result1.targetPath.includes('destination'));

        // Test 2: Target is specific filename - should use that filename
        const result2 = simulateDirectoryDetectionBehavior(tempDir, 'myfile.txt', 'destination/newname.txt');
        assert.strictEqual(path.basename(result2.targetPath), 'newname.txt');
        assert.strictEqual(result2.newFileName, 'newname.txt');

        // Test 3: Target is non-existent path - should treat as new filename
        const result3 = simulateDirectoryDetectionBehavior(tempDir, 'myfile.txt', 'newname.txt');
        assert.strictEqual(path.basename(result3.targetPath), 'newname.txt');
        assert.strictEqual(result3.newFileName, 'newname.txt');

        // Test 4: Absolute path to existing directory
        const result4 = simulateDirectoryDetectionBehavior(tempDir, 'myfile.txt', testDestDir);
        assert.strictEqual(path.basename(result4.targetPath), 'myfile.txt');
        assert.strictEqual(result4.newFileName, 'myfile.txt');

        // Clean up test files
        try {
            fs.unlinkSync(path.join(tempDir, 'myfile.txt'));
            fs.rmdirSync(testDestDir);
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    it("should copy files and directories with dired provider logic", () => {
        // Simulate the DiredProvider copy logic
        function simulateCopy(currentDir: string, fileName: string, newPath: string): { success: boolean, message?: string, error?: string } {
            try {
                const oldPath = path.join(currentDir, fileName);
                
                if (!fs.existsSync(oldPath)) {
                    return { success: false, error: `File ${fileName} does not exist` };
                }
                
                // Handle absolute vs relative paths
                let targetPath: string;
                if (path.isAbsolute(newPath)) {
                    targetPath = newPath;
                } else {
                    targetPath = path.join(currentDir, newPath);
                }
                
                let newFileName = path.basename(targetPath);
                // Check if target path is an existing directory
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                    targetPath = path.join(targetPath, fileName);
                    newFileName = fileName;
                }

                // Create target directory if it doesn't exist
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // Check if source is directory or file and copy accordingly
                const sourceStat = fs.statSync(oldPath);
                if (sourceStat.isDirectory()) {
                    copyDirectoryRecursive(oldPath, targetPath);
                } else {
                    fs.copyFileSync(oldPath, targetPath);
                }

                if (fileName === newFileName) {
                    return { success: true, message: `${fileName} copied to ${targetPath}` };
                } else {
                    return { success: true, message: `${fileName} copied as ${newFileName}` };
                }
            } catch (error) {
                return { success: false, error: `Failed to copy: ${error}` };
            }
        }

        function copyDirectoryRecursive(source: string, target: string): void {
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
                    copyDirectoryRecursive(sourcePath, targetPath);
                } else {
                    fs.copyFileSync(sourcePath, targetPath);
                }
            }
        }

        // Create test directories and files
        const copyTestDir = path.join(tempDir, 'copy_test');
        const sourceDir = path.join(copyTestDir, 'source');
        const targetDir = path.join(copyTestDir, 'target');
        
        fs.mkdirSync(copyTestDir);
        fs.mkdirSync(sourceDir);
        fs.mkdirSync(targetDir);
        
        // Create test files and subdirectory
        fs.writeFileSync(path.join(sourceDir, 'file1.txt'), 'content1');
        fs.writeFileSync(path.join(sourceDir, 'file2.md'), 'content2');
        
        const subDir = path.join(sourceDir, 'subdir');
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, 'nested.txt'), 'nested content');

        // Test 1: Copy file to existing directory (preserves filename)
        const result1 = simulateCopy(sourceDir, 'file1.txt', path.join(copyTestDir, 'target'));
        assert.strictEqual(result1.success, true);
        assert.ok(result1.message?.includes('copied to'));
        assert.ok(fs.existsSync(path.join(targetDir, 'file1.txt')));
        assert.ok(fs.existsSync(path.join(sourceDir, 'file1.txt'))); // Original still exists

        // Test 2: Copy file with new name
        const result2 = simulateCopy(sourceDir, 'file2.md', path.join(copyTestDir, 'target', 'renamed.md'));
        assert.strictEqual(result2.success, true);
        assert.ok(result2.message?.includes('copied as'));
        assert.ok(fs.existsSync(path.join(targetDir, 'renamed.md')));

        // Test 3: Copy directory recursively
        const result3 = simulateCopy(sourceDir, 'subdir', path.join(copyTestDir, 'target'));
        assert.strictEqual(result3.success, true);
        assert.ok(result3.message?.includes('copied to'));
        assert.ok(fs.existsSync(path.join(targetDir, 'subdir')));
        assert.ok(fs.existsSync(path.join(targetDir, 'subdir', 'nested.txt')));
        assert.ok(fs.existsSync(path.join(subDir, 'nested.txt'))); // Original still exists

        // Test 4: Copy to non-existent directory (should create it)
        const result4 = simulateCopy(sourceDir, 'file1.txt', path.join(copyTestDir, 'new_location', 'copy.txt'));
        assert.strictEqual(result4.success, true);
        assert.ok(fs.existsSync(path.join(copyTestDir, 'new_location', 'copy.txt')));

        // Test 5: Try to copy non-existent file
        const result5 = simulateCopy(sourceDir, 'nonexistent.txt', path.join(copyTestDir, 'anywhere.txt'));
        assert.strictEqual(result5.success, false);
        assert.ok(result5.error?.includes('does not exist'));

        // Verify file contents are preserved
        const originalContent = fs.readFileSync(path.join(sourceDir, 'file1.txt'), 'utf8');
        const copiedContent = fs.readFileSync(path.join(targetDir, 'file1.txt'), 'utf8');
        assert.strictEqual(originalContent, copiedContent);

        // Clean up test directory
        function removeDirectory(dirPath: string) {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    if (fs.statSync(filePath).isDirectory()) {
                        removeDirectory(filePath);
                    } else {
                        fs.unlinkSync(filePath);
                    }
                }
                fs.rmdirSync(dirPath);
            }
        }
        
        removeDirectory(copyTestDir);
    });

    it("should filter directories correctly", () => {
        function filterFiles(files: string[], showDotFiles: boolean): string[] {
            return files.filter(filename => {
                if (showDotFiles) return true;
                if (filename === '..' || filename === '.') return true;
                return !filename.startsWith('.');
            });
        }
        
        const allFiles = ['.', '..', 'test1.txt', 'test2.md', 'subdir', '.hidden'];
        
        const withDotFiles = filterFiles(allFiles, true);
        const withoutDotFiles = filterFiles(allFiles, false);
        
        assert.strictEqual(withDotFiles.length, 6);
        assert.strictEqual(withoutDotFiles.length, 5); // excludes .hidden but keeps . and ..
        
        assert.ok(withoutDotFiles.includes('.'));
        assert.ok(withoutDotFiles.includes('..'));
        assert.ok(withoutDotFiles.includes('test1.txt'));
        assert.ok(!withoutDotFiles.includes('.hidden'));
    });

    it("should handle username/groupname fallbacks", () => {
        // Test that when username/groupname resolution fails, we fall back to IDs
        function formatWithFallback(username: string | undefined, groupname: string | undefined, uid: number, gid: number): { user: string, group: string } {
            return {
                user: username || uid.toString(),
                group: groupname || gid.toString()
            };
        }
        
        // Test with resolved names
        const resolved = formatWithFallback('john', 'users', 1000, 1000);
        assert.strictEqual(resolved.user, 'john');
        assert.strictEqual(resolved.group, 'users');
        
        // Test with fallback to IDs
        const fallback = formatWithFallback(undefined, undefined, 1001, 1001);
        assert.strictEqual(fallback.user, '1001');
        assert.strictEqual(fallback.group, '1001');
    });

    it("should parse group file format correctly", () => {
        function parseGroupLine(line: string): { name: string, gid: number } | null {
            const parts = line.split(":");
            if (parts.length >= 3) {
                const name = parts[0];
                const gid = parseInt(parts[2], 10);
                if (!isNaN(gid)) {
                    return { name, gid };
                }
            }
            return null;
        }
        
        // Test typical /etc/group line format: groupname:x:gid:members
        const groupLine = "users:x:100:user1,user2,user3";
        const parsed = parseGroupLine(groupLine);
        
        assert.ok(parsed);
        assert.strictEqual(parsed!.name, 'users');
        assert.strictEqual(parsed!.gid, 100);
        
        // Test root group
        const rootLine = "root:x:0:";
        const rootParsed = parseGroupLine(rootLine);
        
        assert.ok(rootParsed);
        assert.strictEqual(rootParsed!.name, 'root');
        assert.strictEqual(rootParsed!.gid, 0);
    });
});