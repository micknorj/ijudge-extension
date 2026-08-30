# Security Policy

iJudge Extension is part of **Mick's Tools** and is maintained by **micknorj**.

## Supported versions

The latest published pre-release is the version currently supported for security fixes.

Older development builds may no longer receive fixes after a newer version is released.

## Reporting a vulnerability

Do not post passwords, access tokens, cookies, private source code or other sensitive account information in a public GitHub issue.

For a security vulnerability, use GitHub's private vulnerability reporting feature if it is available for this repository.

A useful report should include:

- The affected extension version
- A description of the issue
- Steps to reproduce it
- The expected behavior
- The actual behavior
- Sanitized logs if relevant

Do not include your iJudge password, `access_token`, session cookie or other credentials.

## Security model

The extension communicates directly with:

`https://ijudge.it.kmitl.ac.th`

The extension does not operate an intermediary server.

The user's password is used only for authentication and is not stored by the extension.

The authenticated iJudge session token is stored using the VS Code SecretStorage API.

Authenticated requests are restricted to the official iJudge origin.

Source code is sent to iJudge only when the user explicitly submits it.

## Scope

Security issues include, but are not limited to:

- Credential or session-token disclosure
- Authentication data being sent to an unintended origin
- Unsafe redirect handling
- Unauthorized access to user information
- Submission without explicit user action
- Access-control bypasses introduced by the extension
- Malicious or malformed server responses causing unsafe behavior

Compatibility failures caused only by ordinary iJudge frontend changes are generally treated as bugs rather than security vulnerabilities.

## Examination restrictions

The extension is intended for normal programming assignments.

Automatic submission of exam-labelled assignments is intentionally blocked.

The extension does not attempt to bypass authentication, enrollment, release times, expiration times, disabled submissions or other iJudge access controls.