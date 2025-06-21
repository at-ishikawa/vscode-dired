# Change Log

All notable changes to the "vscode-dired-mode" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Virtual document support for dired buffers (no temporary files)
- Tab names now show directory names instead of temp file names
- Seamless switching between dired and wdired modes without confirmation dialogs
- GitHub Actions for automated testing and publishing
- Support for VSCode 1.85.0+

### Changed
- Updated all dependencies to latest stable versions
- Wdired mode now uses hidden temporary files to avoid save confirmations
- File opening with Enter key now works correctly
- Temporary files are stored in extension storage path (hidden from explorer)

### Fixed
- Fixed issue where Enter key didn't open files
- Fixed tab names showing "." instead of directory name
- Fixed multiple confirmation dialogs when closing wdired mode
- Fixed extension ID in tests

## [0.1.0] - 2023-XX-XX

### Initial Release
- Basic dired functionality for VSCode
- File navigation and management
- Wdired mode for batch renaming
- File operations (create, rename, copy, delete)
- Directory navigation with history