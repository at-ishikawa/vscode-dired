# Testing Documentation

This document describes the testing strategy and available tests for the vscode-dired extension.

## Test Structure

### Unit Tests (`test/core.test.ts`)

These tests focus on core logic functions that don't require VSCode APIs, making them fast and reliable:

### VSCode Extension Tests (`test/extension.test.ts`)

These tests require the full VSCode test environment and verify extension-specific functionality:
- **Extension presence**: Verifies the extension is installed
- **Extension activation**: Tests that the extension activates properly  
- **Command registration**: Checks that all expected commands are registered

#### Core Utility Tests
- **Padding utility function**: Tests the `pad()` function used for formatting file listings
- **Line parsing logic**: Tests functions that parse dired buffer lines to extract filenames, selection status, and file modes  
- **Line formatting logic**: Tests the formatting of file information into dired buffer format
- **Directory path utilities**: Tests helper functions for identifying dot files and special directories
- **Filename validation**: Tests basic filename validation logic

#### File System Integration Tests
- **Directory reading**: Tests reading directory contents with `fs.readdirSync()`
- **File stat information**: Tests accessing file system metadata
- **File renaming**: Tests file system rename operations
- **Directory filtering**: Tests logic for showing/hiding dot files

## Running Tests

### Unit Tests Only
```bash
npm run test-unit
```

This runs the standalone unit tests directly from TypeScript source files using `ts-node`. No compilation required!

**⚠️ Important**: This only runs `test/core.test.ts` - it does NOT run `test/extension.test.ts` because that file requires VSCode APIs.

### Watch Mode (Development)
```bash
npm run test-watch
```

Runs tests in watch mode - automatically re-runs tests when files change.

### VSCode Extension Tests
```bash
npm run test-vscode
```

Runs VSCode extension tests (requires VSCode test environment). This runs `test/extension.test.ts` using the VSCode test runner.

**Note**: Use `npm run test-vscode` instead of `npm test` to avoid ESLint issues during testing.

### All Tests
```bash
npm run test-all
```

Runs both unit tests and VSCode extension tests sequentially.

## Test Coverage

**Unit tests** cover:
- ✅ Core file parsing/formatting logic
- ✅ File system operations  
- ✅ Directory filtering
- ✅ Utility functions

**VSCode extension tests** cover:
- ✅ Extension installation and activation
- ✅ Command registration
- ✅ Basic VSCode API integration

**Not covered** (require manual testing):
- ❌ UI interactions and user workflows
- ❌ Document editing and buffer manipulation
- ❌ Complex keybinding interactions

## Testing Strategy

### What We Test
1. **Pure functions**: Logic that doesn't depend on VSCode APIs
2. **File system operations**: Directory reading, file stats, renaming
3. **Data transformation**: Parsing and formatting dired buffer content
4. **Edge cases**: Special filenames, boundary conditions

### What We Don't Test (and why)
1. **VSCode API interactions**: Complex to mock, better tested through integration
2. **Document manipulation**: Requires VSCode workspace and document APIs
3. **UI components**: Better tested manually or with VSCode test framework
4. **Extension lifecycle**: Requires full VSCode extension test environment

## Benefits of This Approach

1. **Fast execution**: Unit tests run in milliseconds
2. **No compilation**: Tests run directly from TypeScript source using `ts-node`
3. **No dependencies**: Don't require VSCode installation
4. **Easy debugging**: Simple Node.js debugging without extension complexity
5. **Reliable**: Not affected by VSCode API changes
6. **CI-friendly**: Can run in any Node.js environment
7. **Watch mode**: Instant feedback during development

## Future Improvements

1. **Integration tests**: Add VSCode-specific tests for command execution
2. **Mock VSCode APIs**: Create mocks for testing document manipulation
3. **Performance tests**: Add benchmarks for large directory operations
4. **Error handling**: Test error conditions and edge cases
5. **Regression tests**: Add tests for specific bug fixes

## Running Tests in Development

During development, you can run tests continuously:

```bash
npm run test-watch
```

This automatically re-runs tests whenever you save changes to test files or source code, providing instant feedback without any compilation step.