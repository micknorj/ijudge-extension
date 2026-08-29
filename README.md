# iJudge Extension

Part of **Mick's Tools**.

An unofficial VS Code and VSCodium extension for submitting normal KMITL iJudge assignments directly from the editor.

## Features

- Submit Python assignments from the editor title bar
- Automatic file saving before submission
- Problem ID detection from the first line
- Dedicated iJudge terminal for login, progress and results
- Automatic login when the saved session is missing or expired
- Secure session storage using VS Code SecretStorage
- Automatic enrolled-course discovery
- Automatic assignment discovery and availability validation
- Automatic iJudge Server Action discovery
- Submission result polling
- Testcase result, score, quality and execution-time display
- Temporary course and problem metadata caching
- Duplicate-submission protection
- Session-expiration recovery

## Problem ID

Place the iJudge problem ID on the first line of the Python file.

Supported formats:

```python
"""3155"""
```

```python
# 3155
```

```python
# ijudge: 3155
```

## Usage

Open the Python assignment file and click the iJudge submit button in the editor title bar.

If no valid iJudge session exists, the extension opens the dedicated iJudge terminal and asks for your username and password.

The password is used only for login and is not stored.

After authentication, the extension automatically finds the assignment, validates it, submits the active file and waits for the judging result.

The following commands are also available through the Command Palette:

- `Submit to iJudge`
- `iJudge: Login`
- `iJudge: Logout`
- `iJudge: Show Login Status`

Normal use does not require manually running the login command.

## Authentication and privacy

The extension communicates directly with:

`https://ijudge.it.kmitl.ac.th`

Your source code is sent to iJudge only when you explicitly submit it.

Your iJudge password is not stored by the extension.

After successful login, the iJudge access token is stored using VS Code's SecretStorage API. Logging out removes the stored session.

The extension does not operate an intermediary server.

## Scope

This extension is intended for normal programming assignments available to the authenticated student account.

It does not attempt to bypass:

- Assignment release times
- Assignment expiration times
- Disabled submissions
- Authentication
- Course enrollment
- Access controls
- Examination restrictions

Automatic submission of exam-labelled assignments is intentionally blocked.

## Compatibility

The extension currently supports Python assignments.

It is designed for VSCodium and is also compatible with VS Code.

Changes to the iJudge website or its internal interface may temporarily affect compatibility.

## Disclaimer

This is an unofficial project and is not affiliated with or endorsed by KMITL or the iJudge maintainers.

## License

This project is licensed under the MIT License. See `LICENSE`.

Copyright © 2026 **micknorj**.