# Changelog

All notable changes to the iJudge Extension, part of **Mick's Tools**, will be documented in this file.

## 0.8.0 - 2026-09-05

Compatibility-safety and diagnostics development release.

### Compatibility

- Added cross-source Server Action consistency validation
- Server Action references are now evaluated across the inspected page and same-origin frontend JavaScript assets before an action is selected
- Repeated identical Server Action references remain valid
- Conflicting identifiers for the same semantic action are rejected
- Incomplete Server Action discovery now fails closed instead of selecting an action from partial information
- Preserved opaque Server Action identifier handling
- Preserved semantic action discovery for `signIn`
- Preserved semantic action discovery for `submitCodeToServer`
- Preserved normal authenticated HTML course/problem discovery

### Diagnostics

- Added dedicated iJudge compatibility errors
- Added explicit diagnostics for missing Server Actions
- Added explicit diagnostics for conflicting Server Actions
- Added explicit diagnostics for incomplete Server Action discovery
- Added explicit diagnostics for unrecognized course data
- Added explicit diagnostics for unrecognized problem data
- Login now presents frontend compatibility failures separately from ordinary authentication failures
- Assignment discovery and submission now present frontend compatibility failures separately from ordinary runtime failures
- Compatibility diagnostics do not expose runtime Server Action identifiers or authentication material

### Security

- Server Action selection now fails closed when frontend references conflict
- Server Action selection now fails closed when the frontend cannot be inspected completely
- Preserved same-origin restrictions for iJudge requests
- Preserved unauthenticated static frontend JavaScript requests
- Preserved in-memory-only Server Action caching
- Preserved protection against retrying ambiguous source submissions
- Preserved explicit stale-action proof requirement before automatic source-submission rediscovery and retry
- Updated development dependencies to resolve the current npm audit finding

### Reliability

- Added cross-source regression coverage for repeated identical action references
- Added cross-source regression coverage for conflicting action references
- Added page-and-script Server Action consistency coverage
- Added opaque cross-source action identifier coverage
- Added compatibility-error regression coverage for course parsing
- Added compatibility-error regression coverage for problem parsing
- Preserved existing parser, HTTP security-boundary, source-marker and submission-result regression coverage

### Repository

- Development tests are now kept locally rather than tracked in the public repository
- Added `tests/` to `.gitignore`
- Removed public npm scripts that depended on unpublished local test files
- Local development tests remain runnable directly with Node's built-in test runner

## 0.7.0 - 2026-09-02

Compatibility and protocol-resilience development release.

### Compatibility

- Rebuilt iJudge Server Action discovery
- Server Action identifiers are now treated as opaque runtime values
- Server Actions are identified using their generated semantic reference names
- Added automatic discovery for the current login operation
- Added automatic discovery for the current source-submission operation
- Added explicit stale Server Action detection
- Added one-time rediscovery after an explicit Next.js action-not-found response
- Removed dependence on a fixed Server Action identifier length
- Replaced manually constructed RSC course/problem requests with normal authenticated HTML requests
- Added field-order-independent course parsing
- Added field-order-independent problem parsing

### Security

- Removed hard-coded login Server Action fallback identifiers
- Removed hard-coded submission Server Action fallback identifiers
- Server Action identifiers are kept only in runtime memory
- Preserved same-origin restrictions for iJudge requests
- Preserved unauthenticated static frontend JavaScript requests
- Preserved response-size limits
- Preserved explicit source-submission requirement
- Preserved protection against retrying ambiguous submissions
- Distinguished generic forbidden responses from definite session-expiration responses

### Reliability

- Session validation now checks that the returned page resembles the authenticated Courses page
- Added shared parsing helpers for embedded Next.js page data
- Added Server Action discovery regression tests for different identifier lengths
- Added opaque Server Action identifier tests
- Added semantic Server Action selection tests
- Added ambiguous-action rejection tests
- Added field-order-independent course and problem parser tests
- Fixed average execution calculation when some testcases do not provide execution times
- Prevented multiple simultaneous login prompts
- Logout now cancels a pending terminal login prompt
- Authentication resets now clear runtime Server Action caches

### Removed

- Known login Server Action fallback
- Known submission Server Action fallback
- Fixed 40-character Server Action regular expression
- Server Action candidate scoring
- Nearby-keyword Server Action guessing
- Random `_rsc` key generation
- Manually constructed RSC course/problem requests

## 0.6.1

Security, reliability and maintainability release.

### Security

- Centralized all authenticated network requests
- Restricted extension requests to the official iJudge origin
- Prevented callers from manually injecting authentication cookies
- Removed authentication cookies from static JavaScript requests
- Added controlled network timeouts
- Added response-size limits
- Hardened redirect handling
- Improved session-expiration detection
- Added an input-size limit to the iJudge terminal
- Preserved protection against automatic retry of ambiguous submissions
- Added course-response identity validation
- Limited result parsing to the relevant submission region
- Added automated HTTP security-boundary tests

### Reliability

- Added automated problem-marker tests
- Added automated course parser tests
- Added automated assignment parser tests
- Added automated submission-result parser tests
- Added tests for plain and escaped Next.js result data
- Added regression tests for exam-labelled assignment blocking
- Added regression tests for iJudge quality-score calculations
- Added regression tests for execution-time calculations

### Improved

- Reduced duplicated HTTP logic
- Centralized session recovery
- Reduced Server Action discovery requests
- Simplified problem ID detection
- Simplified terminal output helpers
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
- Secure session storage using VS Code SecretStorage
- Automatic enrolled-course discovery
- Automatic assignment discovery
- Assignment availability validation
- Automatic iJudge Server Action discovery
- Compatibility fallback for known Server Actions
- Source submission
- Submission ID handling
- Automatic judging polling
- Testcase result display
- Score display
- PEP 8 quality score display
- Average execution time display
- Session-expiration recovery
- Temporary course and problem metadata caching
- Duplicate-submission protection
- Network request timeouts

### Current limitations

- Python assignments only
- Automatic exam-labelled assignment submission is disabled
