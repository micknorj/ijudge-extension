# iJudge Extension

Part of Mick's Tools.

An unofficial VS Code and VSCodium extension for submitting available KMITL iJudge assignments from the editor.

## Features

- Submit Python assignments from the editor title bar
- Save the active file before submission
- Detect the problem ID from the first line
- Use a dedicated iJudge terminal for login, progress and results
- Log in automatically when the saved session is missing or expired
- Store the authenticated session with VS Code [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
- Discover enrolled courses, assignments and current iJudge Server Actions automatically
- Validate Server Action references across inspected frontend sources
- Keep discovered Server Action identifiers in memory only
- Rediscover and retry once only when iJudge explicitly reports a stale Server Action
- Poll judging results and display testcase results, score, available code-quality details and execution time
- Cache course and problem metadata temporarily
- Prevent duplicate submissions

## Problem ID

Place the iJudge problem ID on the first line of the Python file.

Supported formats:

```python
"""3155"""
```

```python
'''3155'''
```

```python
# 3155
```

```python
# ijudge: 3155
```

## Usage

Open the Python assignment file and select **Submit to iJudge** from the editor title bar.

If no valid session exists, the extension asks for your iJudge username and password in the dedicated terminal. The password is used only for login and is not stored.

After authentication, the extension finds the assignment, validates its availability, submits the active file and waits for the judging result.

The following commands are also available through the Command Palette:

- `Submit to iJudge`
- `iJudge: Login`
- `iJudge: Logout`
- `iJudge: Show Login Status`

Normal use does not require running the login command manually.

## Compatibility and safety

[iJudge](https://ijudge.it.kmitl.ac.th) uses Next.js Server Actions for operations such as login and source submission.

The extension discovers the required actions from the current same-origin iJudge frontend instead of shipping fixed production identifiers. Identifiers are treated as opaque runtime values and are kept in memory only.

Matching references are checked across the inspected page and same-origin frontend JavaScript. If references conflict or the frontend cannot be inspected completely, the extension stops instead of choosing an action from incomplete information.

If iJudge explicitly reports that a cached action no longer exists, the extension may rediscover it and retry once. Ambiguous submission failures such as timeouts, lost connections or generic server errors are not retried because the original submission may already have been accepted.

Compatibility errors are reported separately from ordinary authentication, authorization, networking and assignment-availability failures. They do not expose Server Action identifiers or authentication material.

See the [security policy](SECURITY.md) for the full security model.

## Privacy

The extension communicates directly with [iJudge](https://ijudge.it.kmitl.ac.th) and does not operate an intermediary server.

Your source code is sent to iJudge only when you explicitly submit it. Your password is not stored.

After login, the iJudge session token is stored with VS Code SecretStorage. Logging out removes the stored session.

Discovered Server Action identifiers are not written to settings, SecretStorage, logs or project files. Static frontend JavaScript used for compatibility discovery is fetched without the authenticated session cookie.

## Limitations

- Python assignments only
- Intended for programming assignments available to the authenticated student account
- Exam-labelled assignments can be submitted when iJudge exposes them as currently available
- Does not bypass authentication, enrollment, release times, expiration times, disabled submissions, access controls or examination restrictions
- Changes to the iJudge website or internal interface may temporarily break compatibility

## Development

Development tests are tracked in the repository but excluded from the packaged VSIX through `.vscodeignore`.

Run them with:

```sh
npm run compile
node --test tests/*.test.cjs
```

## Disclaimer

This is an unofficial project and is not affiliated with or endorsed by KMITL or the iJudge maintainers.

## License

Licensed under the [MIT License](LICENSE).

Copyright © 2026 micknorj.
