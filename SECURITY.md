# Security Policy

iJudge Extension is part of **Mick's Tools** and is maintained by **micknorj**.

## Supported Versions

The latest published version is the version currently supported for security fixes.

Development builds may change before release, and older versions may no longer receive fixes after a newer version is published.

## Reporting a Vulnerability

Do not post passwords, access tokens, cookies, private source code, signing material, or other sensitive account information in a public GitHub issue.

For a security vulnerability, use GitHub's private vulnerability reporting feature if it is available for this repository.

A useful report should include:

- The affected extension version
- A description of the issue
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

## Security Model

The extension communicates directly with:

`https://ijudge.it.kmitl.ac.th`

The extension does not operate an intermediary server.

The user's iJudge password is used only during authentication and is not stored by the extension.

After successful authentication, the iJudge session token is stored using the VS Code SecretStorage API.

Source code is sent to iJudge only when the user explicitly submits it.

Authenticated requests are restricted to the official iJudge origin.

## Authentication

The extension uses the user's normal iJudge account and authenticated session.

It does not attempt to bypass:

- Authentication
- Course enrollment
- Assignment access controls
- Assignment release times
- Assignment expiration times
- Disabled submissions
- Examination restrictions
- Other server-side authorization rules

A response indicating forbidden access is not automatically treated as an expired session.

Session-expiration handling is reserved for responses that clearly indicate that authentication is no longer valid.

## Credential Storage

The extension does not store the user's password.

The authenticated iJudge session token is stored using VS Code SecretStorage under the extension's existing session key.

Logging out removes the stored session token and clears runtime caches related to authentication and iJudge frontend discovery.

## Same-Origin Networking

Authenticated requests are restricted to the official iJudge origin.

The extension does not intentionally send the user's authenticated session cookie to external origins.

Authentication cookie attachment is handled centrally rather than being supplied manually by individual callers.

Caller-supplied `Cookie` headers are not accepted for authenticated requests.

Redirect behavior is handled explicitly so authentication data is not silently forwarded to another origin.

## Static Frontend Assets

The extension may inspect current iJudge frontend JavaScript assets in order to discover the Server Actions required for login and source submission.

These assets must:

- Come from the official iJudge origin
- Be referenced by the current iJudge frontend
- Be fetched without the authenticated session cookie

Static JavaScript discovery requests do not receive the user's iJudge authentication token.

## Server Action Handling

iJudge currently uses Next.js Server Actions for operations such as login and source submission.

The extension does not ship known production Server Action identifiers as compatibility fallbacks.

Server Action identifiers are discovered from the current same-origin iJudge frontend.

They are treated as opaque runtime values.

The extension does not assume that an identifier:

- Has a fixed length
- Is hexadecimal
- Uses a particular encoding
- Remains stable between iJudge frontend builds

Server Action identifiers are kept only in process memory.

They are not intentionally written to:

- Source files
- Settings
- SecretStorage
- Logs
- Terminal output
- Documentation
- Test fixtures

Development tests must use synthetic Server Action identifiers.

Server Action identifiers are frontend compatibility metadata. They are not treated as authentication credentials and do not replace normal iJudge authentication or authorization.

## Semantic Server Action Discovery

The extension identifies required Server Actions using their frontend semantic references.

Current supported operations include:

- `signIn`
- `submitCodeToServer`

The extension does not brute-force or enumerate unknown Server Actions.

It does not invoke mutation actions merely to discover which action exists.

Discovery is limited to frontend information exposed through normal same-origin iJudge resources.

## Cross-Source Action Safety

Before selecting a Server Action, the extension evaluates matching references found across the inspected page and same-origin frontend JavaScript assets.

Multiple references to the same identifier are permitted.

If multiple distinct identifiers are found for the same required semantic action, the extension fails closed instead of selecting one arbitrarily.

If the frontend cannot be inspected completely within the extension's safety limits, the extension also fails closed instead of using a result based on incomplete information.

This protects against silently selecting an incorrect or outdated action when the frontend is inconsistent.

## Stale Server Actions

A cached Server Action may become stale while the extension is running.

The extension recognizes the explicit Next.js stale-action response:

`x-nextjs-action-not-found: 1`

When this explicit marker is present, the relevant cached action may be discarded and rediscovered.

A source-submission request may be retried only after this explicit response proves that the referenced Server Action was not recognized.

## Submission Retry Safety

Source submission is a mutation and is handled conservatively.

The extension does not automatically retry a submission after ambiguous failures such as:

- Request timeout
- Connection loss
- Generic HTTP 404
- Generic HTTP 5xx response
- Malformed response
- Uncertain response
- Other cases where it is unknown whether the original submission was accepted

This prevents accidental duplicate submissions.

The only automatic source-submission rediscovery and retry path is the explicit stale-action response described above.

At most one retry is permitted for that condition.

## Compatibility Diagnostics

The extension reports frontend compatibility failures separately from ordinary runtime failures where possible.

Examples include:

- Required Server Action not found
- Conflicting Server Action references
- Incomplete Server Action discovery
- Unrecognized course data
- Unrecognized problem data

Compatibility diagnostics are designed to fail safely rather than guess how a changed iJudge frontend should be interpreted.

Compatibility diagnostics must not expose:

- Runtime Server Action identifiers
- Passwords
- Access tokens
- Session cookies
- Authentication request bodies
- Other authentication material

Ordinary changes to the iJudge frontend that temporarily break compatibility are generally treated as software compatibility issues rather than security vulnerabilities unless they create a security impact.

## Course and Problem Discovery

Course and problem information is obtained from normal authenticated iJudge pages.

The extension does not construct synthetic Next.js client-navigation requests solely to obtain this information.

Parsers are designed to avoid depending unnecessarily on exact serialized property ordering.

If required course or problem information cannot be recognized safely, the extension stops rather than making assumptions about assignment access or submission targets.

## Assignment Restrictions

The extension is intended for normal programming assignments available to the authenticated user.

Automatic submission is blocked when an assignment is identified as examination-related.

Restrictions include checks for:

- Exam-labelled courses
- Exam-labelled problems
- iJudge exam state
- Non-Python assignments
- Disabled submissions
- Assignments that have not yet been released
- Expired assignments

The extension does not attempt to weaken or override server-side restrictions.

## Submission Target Integrity

The extension uses the iJudge course-problem identifier `cp_id` as the submission field:

`course_problem_id`

It must not substitute `cp_problem_id` for this value.

This distinction is required to avoid sending a submission to the wrong course-problem relationship.

## Response and Input Limits

Network responses and terminal input are bounded to reduce the risk of excessive memory use or unbounded parsing.

The extension also uses request timeouts and bounded result parsing.

These limits are intended to reduce the impact of malformed or unexpectedly large responses.

## Local Development Tests

Development tests are kept locally and are not tracked in the current public repository.

Test fixtures must not contain:

- Real production Server Action identifiers
- Passwords
- Access tokens
- Cookies
- Authorization values
- Private signing material

Synthetic values should be used for security and compatibility regression tests.

## Security-Sensitive Areas

Security issues may include, but are not limited to:

- Credential or session-token disclosure
- Authentication data being sent to an unintended origin
- Unsafe redirect handling
- Unauthorized access introduced by the extension
- Submission without explicit user action
- Access-control bypasses introduced by the extension
- Authentication cookies being attached to static frontend assets
- Persistence or logging of runtime Server Action identifiers
- Unsafe selection of conflicting Server Actions
- Automatic retry of an ambiguous source-submission request
- Weakening of examination or assignment restrictions
- Incorrect submission-target handling

## Examination Restrictions

The extension is not intended to automate examination submissions.

Automatic submission of exam-labelled assignments is intentionally blocked.

The extension must not be modified as part of normal project development to bypass authentication, enrollment, release times, expiration times, disabled submission state, examination restrictions, or other iJudge controls.

## Disclaimer

iJudge Extension is an unofficial project and is not affiliated with or endorsed by KMITL or the iJudge maintainers.
