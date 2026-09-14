const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const actions = require("../out/actions.js");
const http = require("../out/http.js");
const client = require("../out/client.js");
const { IJudgeCompatibilityError, SessionExpiredError } = require("../out/errors.js");

const originals = {
    getLoginAction: actions.getLoginAction,
    invalidateLoginAction: actions.invalidateLoginAction,
    fetchIJudge: http.fetchIJudge,
};

afterEach(() => {
    actions.getLoginAction = originals.getLoginAction;
    actions.invalidateLoginAction = originals.invalidateLoginAction;
    http.fetchIJudge = originals.fetchIJudge;
});

test("loginToIJudge sends the current discovered action and returns the access token", async () => {
    let request;
    actions.getLoginAction = async () => "synthetic-login-action";
    http.fetchIJudge = async (path, options, token) => {
        request = { path, options, token };
        return new Response("", {
            status: 303,
            headers: { "set-cookie": "access_token=synthetic-session; Path=/; HttpOnly" },
        });
    };

    const result = await client.loginToIJudge("student", "synthetic-password");
    assert.equal(result.accessToken, "synthetic-session");
    assert.equal(request.path, "/signin");
    assert.equal(request.token, undefined);
    assert.equal(request.options.method, "POST");
    assert.equal(new Headers(request.options.headers).get("Next-Action"), "synthetic-login-action");
    assert.deepEqual(JSON.parse(request.options.body), ["student", "synthetic-password", "$undefined"]);
});

test("login retries once only after the explicit stale-action response", async () => {
    let fetches = 0;
    let discoveries = 0;
    let invalidations = 0;

    actions.getLoginAction = async () => `synthetic-login-${++discoveries}`;
    actions.invalidateLoginAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        if (fetches === 1) {
            return new Response("", { status: 404, headers: { "x-nextjs-action-not-found": "1" } });
        }
        return new Response("", { status: 303, headers: { "set-cookie": "access_token=synthetic-session" } });
    };

    const result = await client.loginToIJudge("student", "synthetic-password");
    assert.equal(result.accessToken, "synthetic-session");
    assert.equal(fetches, 2);
    assert.equal(discoveries, 2);
    assert.equal(invalidations, 1);
});

test("login fails with ACTION_NOT_FOUND after a second explicit stale-action response", async () => {
    let fetches = 0;
    let invalidations = 0;
    actions.getLoginAction = async () => "synthetic-login";
    actions.invalidateLoginAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 404, headers: { "x-nextjs-action-not-found": "1" } });
    };

    await assert.rejects(
        client.loginToIJudge("student", "synthetic-password"),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "ACTION_NOT_FOUND"
    );
    assert.equal(fetches, 2);
    assert.equal(invalidations, 2);
});

test("generic HTTP 404 does not trigger login rediscovery or retry", async () => {
    let fetches = 0;
    let invalidations = 0;
    actions.getLoginAction = async () => "synthetic-login";
    actions.invalidateLoginAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 404 });
    };

    await assert.rejects(client.loginToIJudge("student", "synthetic-password"), /HTTP 404/);
    assert.equal(fetches, 1);
    assert.equal(invalidations, 0);
});

test("login requires an access_token cookie in the response", async () => {
    actions.getLoginAction = async () => "synthetic-login";
    http.fetchIJudge = async () => new Response("", { status: 303 });
    await assert.rejects(client.loginToIJudge("student", "synthetic-password"), /did not return an access token/);
});

test("isSessionValid returns false for an expired session but does not treat 403 as expiration", async () => {
    http.fetchIJudge = async () => new Response("", { status: 401 });
    assert.equal(await client.isSessionValid("synthetic-session"), false);

    http.fetchIJudge = async () => new Response("forbidden", { status: 403 });
    await assert.rejects(client.isSessionValid("synthetic-session"), /HTTP 403/);
});

test("isSessionValid recognizes the Courses page title", async () => {
    http.fetchIJudge = async () => new Response("<html><title>Courses - iJudge</title></html>", { status: 200 });
    assert.equal(await client.isSessionValid("synthetic-session"), true);
});

test("isSessionValid recognizes serialized course data", async () => {
    http.fetchIJudge = async () => new Response(String.raw`{\"courseName\":\"Programming\"}`, { status: 200 });
    assert.equal(await client.isSessionValid("synthetic-session"), true);
});

test("isSessionValid returns false for an unrelated successful page", async () => {
    http.fetchIJudge = async () => new Response("<html><title>Other</title></html>", { status: 200 });
    assert.equal(await client.isSessionValid("synthetic-session"), false);
});

test("fetchAuthenticatedPage passes the session token and returns bounded page text", async () => {
    let call;
    http.fetchIJudge = async (path, options, token) => {
        call = { path, options, token };
        return new Response("page-body", { status: 200 });
    };

    assert.equal(await client.fetchAuthenticatedPage("/courses", "synthetic-session"), "page-body");
    assert.equal(call.path, "/courses");
    assert.equal(call.token, "synthetic-session");
});

test("fetchAuthenticatedPage propagates session expiration as SessionExpiredError", async () => {
    http.fetchIJudge = async () => new Response("", { status: 401 });
    await assert.rejects(
        client.fetchAuthenticatedPage("/courses", "synthetic-session"),
        (error) => error instanceof SessionExpiredError
    );
});
