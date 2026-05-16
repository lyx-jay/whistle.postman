# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-05-15

### Fixed
- Response search not highlighting full match with syntax highlighted content
- Search not updating when query changes
- Response not auto-scrolling into view after request
- Missing loading state during request

### Added
- Build scripts (scripts/build.sh, scripts/publish.sh)
- CHANGELOG.md
- npm publish workflow

## [1.0.0] - 2026-05-15

### Added

#### Core Features
- HTTP request editor with Method, URL, Headers, Body, and Auth support
- Request import: cURL, HAR, Raw HTTP, OpenAPI formats
- Environment variables with `{{variable}}` syntax
- Collections with folder organization
- Request history tracking
- AI Mock generation (OpenAI compatible)
- Mock templates management

#### Script Engine
- Pre-request script execution with `pm.*` API
- Tests script execution with `pm.test()` and `pm.expect()`
- Sandbox module for safe script execution
- CodeMirror editors for script editing

#### Whistle Integration
- Whistle Rules API (POST/GET/DELETE /api/rules)
- "Mock This" button for one-click mock rules
- Rule generation panel (Mock, Redirect, Delay, Throttle)
- Network menu integration ("Edit in Postman")
- URL parameter import from Network panel

#### UI Features
- Dark theme with CodeMirror integration
- Response body with syntax highlighting
- Response search with highlighting
- Auto-scroll to response after request
- Loading state during request
- Copy as cURL functionality
- Keyboard shortcuts (Cmd+Enter, Cmd+S)

#### AI Features
- AI test generation from response
- AI mock generation with JSON Schema support
- Configurable AI provider (OpenAI or custom endpoint)

### Fixed

- Empty headers causing 400 error
- "+ Add Environment" button not working
- "Save Current Mock as Template" reading non-existent element
- Response search missing matches with syntax highlighted content
- Test results not rendering in UI
- Snippet button insertion not working
- Search not updating when query changes
