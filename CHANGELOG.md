# Changelog

All notable changes to the iJudge Extension, part of **Mick's Tools**, will be documented in this file.

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