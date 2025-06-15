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