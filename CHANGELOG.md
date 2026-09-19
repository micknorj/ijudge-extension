# Changelog

Notable changes to iJudge Extension.

## 0.8.1 - 2026-09-19

Focused terminal presentation release.

### Improved

- Grouped assignment, submission, result, code-quality and testcase output into compact terminal sections
- Added per-testcase execution times when iJudge provides them
- Added server-provided code-quality issue details with line, column, category and message
- Structured assignment restrictions, compatibility diagnostics and other errors consistently
- Sanitized section text to prevent terminal control sequences from affecting presentation
- Preserved percentage-only code-quality output when detailed issue data is missing or malformed

### Reliability

- Added regression coverage for terminal section formatting and control-character handling
- Added quality-result coverage for 100%, below-100%, zero, one, multiple, missing and malformed issue data
- Preserved existing submission-result and testcase parsing behavior

## 0.8.0 - 2026-09-05

Compatibility-safety and diagnostics development release.

### Compatibility

- Added cross-source Server Action consistency validation
- Evaluated references across the inspected page and same-origin frontend JavaScript before selecting an action
- Allowed repeated references to the same identifier
- Rejected conflicting identifiers for the same semantic action
- Failed closed when Server Action discovery was incomplete
- Preserved opaque Server Action identifier handling
- Preserved semantic discovery for `signIn`
- Preserved semantic discovery for `submitCodeToServer`
- Preserved normal authenticated HTML course and problem discovery

### Diagnostics

- Added dedicated iJudge compatibility errors
- Added diagnostics for missing, conflicting and incompletely discovered Server Actions
- Added diagnostics for unrecognized course and problem data
- Separated frontend compatibility failures from ordinary authentication failures during login
- Separated frontend compatibility failures from ordinary runtime failures during assignment discovery and submission
- Prevented compatibility diagnostics from exposing Server Action identifiers or authentication material

### Security

- Failed closed when frontend references conflict or cannot be inspected completely
- Preserved same-origin restrictions for iJudge requests
- Preserved unauthenticated static frontend JavaScript requests
- Preserved in-memory-only Server Action caching
- Preserved protection against retrying ambiguous source submissions
- Preserved the explicit stale-action proof requirement before rediscovery and retry
- Updated development dependencies to resolve the current npm audit finding

### Reliability

- Added regression coverage for repeated and conflicting cross-source action references
- Added page-and-script Server Action consistency coverage
- Added opaque cross-source action identifier coverage
- Added compatibility-error regression coverage for course and problem parsing
- Preserved existing parser, HTTP security-boundary, source-marker and submission-result coverage

### Repository

- Tracked development tests with the public source from the 0.8 development line onward
- Kept `tests/` excluded from distributed VSIX packages through `.vscodeignore`
- Kept tests runnable with Node's built-in test runner

## 0.7.0 - 2026-09-02

Compatibility and protocol-resilience development release.

### Compatibility

- Rebuilt iJudge Server Action discovery
- Treated Server Action identifiers as opaque runtime values
- Identified Server Actions through generated semantic reference names
- Added automatic discovery for login and source submission
- Added explicit stale Server Action detection
- Added one-time rediscovery after an explicit Next.js action-not-found response
- Removed dependence on a fixed Server Action identifier length
- Replaced manually constructed RSC course and problem requests with normal authenticated HTML requests
- Added field-order-independent course and problem parsing

### Security

- Removed hard-coded login and submission Server Action fallback identifiers
- Kept Server Action identifiers in runtime memory only
- Preserved same-origin restrictions for iJudge requests
- Preserved unauthenticated static frontend JavaScript requests
- Preserved response-size limits
- Preserved the explicit source-submission requirement
- Preserved protection against retrying ambiguous submissions
- Distinguished generic forbidden responses from definite session-expiration responses

### Reliability

- Validated that session-check responses resemble the authenticated Courses page
- Added shared parsing helpers for embedded Next.js page data
- Added tests for different identifier lengths, opaque identifiers, semantic selection and ambiguous-action rejection
- Added field-order-independent course and problem parser tests
- Fixed average execution calculation when some testcases omit execution times
- Prevented multiple simultaneous login prompts
- Made logout cancel a pending terminal login prompt
- Cleared runtime Server Action caches during authentication resets

### Removed

- Known login Server Action fallback
- Known submission Server Action fallback
- Fixed 40-character Server Action regular expression
- Server Action candidate scoring
- Nearby-keyword Server Action guessing
- Random `_rsc` key generation
- Manually constructed RSC course and problem requests

## 0.6.1

Security, reliability and maintainability release.

### Security

- Centralized authenticated network requests
- Restricted extension requests to the official iJudge origin
- Prevented callers from injecting authentication cookies
- Removed authentication cookies from static JavaScript requests
- Added controlled network timeouts and response-size limits
- Hardened redirect handling
- Improved session-expiration detection
- Added an input-size limit to the iJudge terminal
- Preserved protection against automatic retry of ambiguous submissions
- Added course-response identity validation
- Limited result parsing to the relevant submission region
- Added automated HTTP security-boundary tests

### Reliability

- Added automated problem-marker, course parser, assignment parser and submission-result parser tests
- Added tests for plain and escaped Next.js result data
- Added regression tests for exam-labelled assignment blocking
- Added regression tests for iJudge quality-score calculations
- Added regression tests for execution-time calculations

### Improved

- Reduced duplicated HTTP logic
- Centralized session recovery
- Reduced Server Action discovery requests
- Simplified problem ID detection and terminal output helpers
- Improved polling failure handling
- Separated submission parsing from network requests
- Preserved temporary course and problem caching

### Removed

- Duplicate HTTP timeout implementations
- Duplicate redirect implementations
- Duplicate cookie construction
- Authentication cookies on static JavaScript requests
- Unused submission `createdAt` parsing
- Unused assignment-discovery status callback
- Unused cached `courseId` metadata
- Empty extension `deactivate()` function
- Redundant development comments

## 0.6.0

Initial public pre-release.

### Added

- Python assignment submission from the editor title bar
- Dedicated iJudge terminal
- Automatic authentication when required
- Secure session storage with VS Code SecretStorage
- Automatic enrolled-course and assignment discovery
- Assignment availability validation
- Automatic iJudge Server Action discovery
- Compatibility fallback for known Server Actions
- Source submission and submission ID handling
- Automatic judging polling
- Testcase, score, PEP 8 quality and average execution-time display
- Session-expiration recovery
- Temporary course and problem metadata caching
- Duplicate-submission protection
- Network request timeouts

### Limitations

- Python assignments only
- Automatic submission of exam-labelled assignments disabled
