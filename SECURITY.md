# Security policy

## Supported versions

The latest published version is supported for security fixes.

Development builds may change before release. Older versions may stop receiving fixes after a newer version is published.

## Reporting a vulnerability

Do not post passwords, access tokens, cookies, private source code, signing material or other sensitive account information in a public GitHub issue.

Use GitHub's private vulnerability reporting feature if it is available for this repository.

A useful report should include:

- Affected extension version
- Description of the issue
- Steps to reproduce it
- Expected behavior
- Actual behavior
- Sanitized logs, if relevant

Do not include:

- iJudge passwords
- `access_token` values
- Cookie headers
- Authorization values
- Runtime Server Action identifiers
- Private signing keys

## Security model

The extension communicates directly with [iJudge](https://ijudge.it.kmitl.ac.th) and does not operate an intermediary server.

Your iJudge password is used only during authentication and is not stored. After successful login, the session token is stored with VS Code [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage).

Source code is sent only when you explicitly submit it. Authenticated requests are restricted to the official iJudge origin.

The extension uses your normal iJudge account and does not attempt to bypass:

- Authentication
- Course enrollment
- Assignment access controls
- Assignment release times
- Assignment expiration times
- Disabled submissions
- Examination restrictions
- Other server-side authorization rules

A forbidden response is not automatically treated as an expired session. Session recovery is used only when the response clearly indicates that authentication is no longer valid.

## Credential storage

The password is never stored.

The authenticated session token is stored in SecretStorage under the extension's session key. Logging out removes the stored token and clears runtime authentication and frontend-discovery caches.

## Networking

Authenticated requests are restricted to the official iJudge origin.

Authentication cookie attachment is handled centrally. Callers cannot provide their own `Cookie` header for authenticated requests.

Redirects are handled explicitly so authentication data is not silently forwarded to another origin.

## Static frontend assets

The extension may inspect current iJudge frontend JavaScript to discover the Server Actions required for login and source submission.

These assets must:

- Come from the official iJudge origin
- Be referenced by the current iJudge frontend
- Be fetched without the authenticated session cookie

Static discovery requests do not receive the user's iJudge authentication token.

## Server Action handling

The extension does not ship known production Server Action identifiers as compatibility fallbacks.

Identifiers are discovered from the current same-origin frontend and treated as opaque runtime values. The extension does not assume that an identifier:

- Has a fixed length
- Is hexadecimal
- Uses a specific encoding
- Remains stable between frontend builds

Identifiers are kept only in process memory and are not intentionally written to:

- Source files
- Settings
- SecretStorage
- Logs
- Terminal output
- Documentation
- Test fixtures

Development tests must use synthetic identifiers.

Server Action identifiers are compatibility metadata. They do not replace iJudge authentication or authorization.

### Semantic discovery

Current supported semantic references are:

- `signIn`
- `submitCodeToServer`

The extension does not brute-force or enumerate unknown Server Actions and does not invoke mutation actions merely to discover which action exists.

Discovery is limited to information exposed through normal same-origin iJudge resources.

### Cross-source validation

Before selecting an action, the extension compares matching references found across the inspected page and same-origin frontend JavaScript.

Repeated references to the same identifier are accepted.

If different identifiers are found for the same semantic action, or if the frontend cannot be inspected completely within the extension's safety limits, the extension stops instead of selecting from incomplete or conflicting information.

### Stale actions

A cached action may become stale while the extension is running.

The extension recognizes the explicit Next.js marker:

```text
x-nextjs-action-not-found: 1
```

When this marker is present, the relevant cached action may be discarded and rediscovered.

A source submission may be retried only after this response proves that the referenced action was not recognized. At most one retry is allowed.

## Submission retry safety

Source submission changes server state and is handled conservatively.

The extension does not automatically retry after ambiguous failures such as:

- Request timeout
- Connection loss
- Generic HTTP 404
- Generic HTTP 5xx response
- Malformed response
- Uncertain response
- Any case where it is unknown whether the original submission was accepted

This reduces the risk of duplicate submissions.

The only automatic source-submission rediscovery and retry path is the explicit stale-action response described above.

## Compatibility diagnostics

Frontend compatibility failures are reported separately from ordinary runtime failures where possible.

Examples include:

- Required Server Action not found
- Conflicting Server Action references
- Incomplete Server Action discovery
- Unrecognized course data
- Unrecognized problem data

Compatibility diagnostics fail safely rather than guessing how a changed frontend should be interpreted.

They must not expose:

- Runtime Server Action identifiers
- Passwords
- Access tokens
- Session cookies
- Authentication request bodies
- Other authentication material

A frontend change that breaks compatibility is normally a software compatibility issue rather than a security vulnerability unless it creates a security impact.

## Course and problem discovery

Course and problem information is read from normal authenticated iJudge pages.

The extension does not construct synthetic Next.js client-navigation requests solely to obtain this information. Parsers avoid unnecessary dependence on serialized property ordering.

If required course or problem data cannot be recognized safely, the extension stops instead of assuming the assignment or submission target.

## Assignment restrictions

The extension is intended for Python programming assignments available to the authenticated user.

An exam label alone does not block submission. Exam-labelled assignments are considered only when iJudge exposes them through the authenticated student's enrolled courses and their current assignment metadata permits submission.

Restrictions include checks for:

- Course enrollment and authorization
- Non-Python assignments
- Disabled submissions
- Assignments that have not yet been released
- Expired assignments
- Server-side examination and access restrictions

The extension does not attempt to weaken or override server-side restrictions.

## Submission target integrity

The iJudge course-problem identifier `cp_id` is submitted as:

```text
course_problem_id
```

It must not be replaced with `cp_problem_id`, which could target a different course-problem relationship.

## Response and input limits

Network responses and terminal input are bounded to reduce excessive memory use and unbounded parsing.

The extension also uses request timeouts and bounded result parsing.

## Development tests

Security and compatibility tests are tracked in the public repository from version 0.8 onward. The `tests/` directory must remain excluded from the distributed VSIX package.

Test fixtures must not contain:

- Real production Server Action identifiers
- Passwords
- Access tokens
- Cookies
- Authorization values
- Private signing material

Use synthetic values for security and compatibility regression tests.

## Security-sensitive areas

Security issues may include:

- Credential or session-token disclosure
- Authentication data sent to an unintended origin
- Unsafe redirect handling
- Unauthorized access introduced by the extension
- Submission without explicit user action
- Access-control bypasses introduced by the extension
- Authentication cookies attached to static frontend assets
- Persistence or logging of runtime Server Action identifiers
- Unsafe selection of conflicting Server Actions
- Automatic retry of an ambiguous source submission
- Weakening of examination or assignment restrictions
- Incorrect submission-target handling

## Examination restrictions

Exam labels may remain on assignments that iJudge later reopens for practice. The extension does not treat the label alone as an access restriction.

Exam-labelled assignments can proceed only when normal authenticated discovery exposes them and the current release, expiration and submission state permits submission. iJudge remains authoritative for server-side examination and access restrictions.

Normal project development must not bypass authentication, enrollment, release times, expiration times, disabled submission state, examination restrictions or other iJudge controls.

## Disclaimer

iJudge Extension is an unofficial project and is not affiliated with or endorsed by KMITL or the iJudge maintainers.
