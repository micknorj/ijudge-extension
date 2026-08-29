# Changelog

All notable changes to the iJudge Extension, part of **Mick's Tools**, will be documented in this file.

## 0.6.0

Initial development release.

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
- Protection against automatic retries of ambiguous submission requests

### Current limitations

- Python assignments only
- Automatic exam-labelled assignment submission is disabled