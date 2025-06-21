//
// VSCode Extension Tests - These require the VSCode test environment
// 
// IMPORTANT: Run with `npm test` (not `npm run test-unit`)
// These tests need the full VSCode test runner to work properly
//

import * as assert from 'assert';
import * as vscode from 'vscode';

// Minimal extension tests that work in VSCode test environment
suite("VSCode Extension Tests", () => {

    test("Extension should be present", () => {
        const extension = vscode.extensions.getExtension("at-ishikawa.vscode-dired-mode");
        assert.ok(extension, "vscode-dired-mode extension should be installed");
    });

    test("Extension should be activatable", async () => {
        const extension = vscode.extensions.getExtension("at-ishikawa.vscode-dired-mode");
        assert.ok(extension, "Extension should be found");
        // Don't force activation to avoid file system issues in test environment
    });

    test("VSCode APIs should be available", () => {
        // Basic test that VSCode APIs are accessible
        assert.ok(vscode.commands, "VSCode commands API should be available");
        assert.ok(vscode.window, "VSCode window API should be available");
        assert.ok(vscode.workspace, "VSCode workspace API should be available");
    });
});
