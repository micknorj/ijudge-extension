const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const actions = require("../out/actions.js");
const client = require("../out/client.js");
const courses = require("../out/courses.js");
const problems = require("../out/problems.js");
const { IJudgeCompatibilityError } = require("../out/errors.js");

const originals = {
    clearActionCache: actions.clearActionCache,
    isSessionValid: client.isSessionValid,
    loginToIJudge: client.loginToIJudge,
    clearCourseCache: courses.clearCourseCache,
    clearProblemCache: problems.clearProblemCache,
};

function freshAuth() {
    const path = require.resolve("../out/auth.js");
    delete require.cache[path];
    return require(path);
}

function createSecrets(initial) {
    const values = new Map();
    if (initial !== undefined) {
        values.set("micknorj.tools.ijudge.accessToken", initial);
    }
    const calls = { get: [], store: [], delete: [] };
    return {
        calls,
        async get(key) {
            calls.get.push(key);
            return values.get(key);
        },
        async store(key, value) {
            calls.store.push([key, value]);
            values.set(key, value);
        },
        async delete(key) {
            calls.delete.push(key);
            values.delete(key);
        },
    };
}

function createTerminal(promptValues = []) {
    const calls = { show: [], cancelPrompt: 0, prompt: [], writeLine: [], writeLines: [], writeSection: [] };
    let promptIndex = 0;
    return {
        calls,
        show(value) { calls.show.push(value); },
        cancelPrompt() { calls.cancelPrompt++; },
        async prompt(label, hidden) {
            calls.prompt.push([label, hidden]);
            return promptValues[promptIndex++];
        },
        writeLine(value = "") { calls.writeLine.push(value); },
        writeLines(...values) { calls.writeLines.push(values); },
        writeSection(title, rows = []) { calls.writeSection.push([title, rows]); },
    };
}

afterEach(() => {
    actions.clearActionCache = originals.clearActionCache;
    client.isSessionValid = originals.isSessionValid;
    client.loginToIJudge = originals.loginToIJudge;
    courses.clearCourseCache = originals.clearCourseCache;
    problems.clearProblemCache = originals.clearProblemCache;
});

test("uses the current SecretStorage session key", async () => {
    const auth = freshAuth();
    const secrets = createSecrets("synthetic-session");
    assert.equal(await auth.getAccessToken(secrets), "synthetic-session");
    assert.deepEqual(secrets.calls.get, ["micknorj.tools.ijudge.accessToken"]);
});

test("successful login stores only the resulting session token, not the password", async () => {
    const auth = freshAuth();
    const secrets = createSecrets();
    const terminal = createTerminal(["student", "synthetic-password"]);
    let received;
    client.loginToIJudge = async (username, password) => {
        received = { username, password };
        return { accessToken: "synthetic-session" };
    };

    assert.equal(await auth.login(secrets, terminal), true);
    assert.deepEqual(received, { username: "student", password: "synthetic-password" });
    assert.deepEqual(secrets.calls.store, [["micknorj.tools.ijudge.accessToken", "synthetic-session"]]);
    assert.equal(JSON.stringify(secrets.calls.store).includes("synthetic-password"), false);
});

test("login is single-flight for simultaneous callers", async () => {
    const auth = freshAuth();
    const secrets = createSecrets();
    const terminal = createTerminal(["student", "synthetic-password"]);
    let resolveLogin;
    let loginCalls = 0;
    client.loginToIJudge = async () => {
        loginCalls++;
        return new Promise((resolve) => { resolveLogin = resolve; });
    };

    const first = auth.login(secrets, terminal);
    await new Promise((resolve) => setImmediate(resolve));
    const second = auth.login(secrets, terminal);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(loginCalls, 1);
    resolveLogin({ accessToken: "synthetic-session" });
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(terminal.calls.prompt.length, 2);
});

test("logout cancels a pending login and prevents a late login result from restoring the session", async () => {
    const auth = freshAuth();
    const secrets = createSecrets();
    const terminal = createTerminal(["student", "synthetic-password"]);
    let resolveLogin;
    client.loginToIJudge = async () => new Promise((resolve) => { resolveLogin = resolve; });

    const pending = auth.login(secrets, terminal);
    await new Promise((resolve) => setImmediate(resolve));
    await auth.logout(secrets, terminal);
    resolveLogin({ accessToken: "late-synthetic-session" });

    assert.equal(await pending, false);
    assert.equal(secrets.calls.store.length, 0);
    assert.equal(terminal.calls.cancelPrompt, 1);
    assert.deepEqual(secrets.calls.delete, ["micknorj.tools.ijudge.accessToken"]);
});

test("successful login clears runtime caches before storing the session", async () => {
    const auth = freshAuth();
    const secrets = createSecrets();
    const terminal = createTerminal(["student", "synthetic-password"]);
    const cleared = [];
    actions.clearActionCache = () => cleared.push("actions");
    courses.clearCourseCache = () => cleared.push("courses");
    problems.clearProblemCache = () => cleared.push("problems");
    client.loginToIJudge = async () => ({ accessToken: "synthetic-session" });

    assert.equal(await auth.login(secrets, terminal), true);
    assert.deepEqual(cleared, ["actions", "courses", "problems"]);
});

test("logout clears all runtime caches", async () => {
    const auth = freshAuth();
    const secrets = createSecrets("synthetic-session");
    const terminal = createTerminal();
    const cleared = [];
    actions.clearActionCache = () => cleared.push("actions");
    courses.clearCourseCache = () => cleared.push("courses");
    problems.clearProblemCache = () => cleared.push("problems");

    await auth.logout(secrets, terminal);
    assert.deepEqual(cleared, ["actions", "courses", "problems"]);
});

test("ensureAuthenticated returns a valid stored session without prompting", async () => {
    const auth = freshAuth();
    const secrets = createSecrets("synthetic-session");
    const terminal = createTerminal();
    client.isSessionValid = async (token) => token === "synthetic-session";

    assert.equal(await auth.ensureAuthenticated(secrets, terminal), "synthetic-session");
    assert.equal(terminal.calls.prompt.length, 0);
});

test("compatibility failures are reported distinctly without exposing action identifiers from the standard error", async () => {
    const auth = freshAuth();
    const secrets = createSecrets();
    const terminal = createTerminal(["student", "synthetic-password"]);
    client.loginToIJudge = async () => {
        throw new IJudgeCompatibilityError(
            "ACTION_AMBIGUOUS",
            "Conflicting iJudge login actions were found in the current frontend. The extension stopped instead of guessing."
        );
    };

    assert.equal(await auth.login(secrets, terminal), false);
    const output = JSON.stringify(terminal.calls);
    assert.match(output, /Compatibility/);
    assert.match(output, /stopped instead of guessing/);
    assert.doesNotMatch(output, /synthetic-login-action/);
});
