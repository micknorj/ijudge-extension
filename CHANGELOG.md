# Changelog

All notable changes to the iJudge Extension, part of **Mick's Tools**, will be documented in this file.

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
