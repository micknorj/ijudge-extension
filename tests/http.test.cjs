const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
    assertAuthenticatedResponse,
    fetchIJudge,
    ijUrl,
    isActionNotFoundResponse,
    isRedirect,
    isSessionExpiredResponse,
    readTextLimited,
} = require("../out/http.js");
const { SessionExpiredError } = require("../out/errors.js");

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

test("ijUrl accepts official iJudge paths", () => {
    assert.equal(ijUrl("/courses"), "https://ijudge.it.kmitl.ac.th/courses");
});

test("ijUrl rejects absolute and scheme-relative external origins", () => {
    assert.throws(() => ijUrl("https://example.com/"), /outside the iJudge origin/);
    assert.throws(() => ijUrl("//example.com/path"), /outside the iJudge origin/);
});

test("fetchIJudge refuses an external origin before calling fetch", async () => {
    let called = false;
    global.fetch = async () => {
        called = true;
        return new Response("unexpected");
    };

    await assert.rejects(fetchIJudge("https://example.com/", {}, "synthetic-token"), /outside the iJudge origin/);
    assert.equal(called, false);
});

test("fetchIJudge attaches the session only to an internal request", async () => {
    let cookie;
    let redirect;
    global.fetch = async (_url, init) => {
        cookie = new Headers(init.headers).get("Cookie");
        redirect = init.redirect;
        return new Response("ok", { status: 200 });
    };

    await fetchIJudge("/courses", {}, "synthetic-token");
    assert.equal(cookie, "access_token=synthetic-token");
    assert.equal(redirect, "manual");
});

test("fetchIJudge leaves unauthenticated requests without a Cookie header", async () => {
    let cookie;
    global.fetch = async (_url, init) => {
        cookie = new Headers(init.headers).get("Cookie");
        return new Response("ok", { status: 200 });
    };

    await fetchIJudge("/_next/static/chunks/app.js");
    assert.equal(cookie, null);
});

test("callers cannot inject Cookie headers", async () => {
    await assert.rejects(
        fetchIJudge("/courses", { headers: { Cookie: "bad=value" } }),
        /managed internally/
    );
});

test("fetchIJudge converts AbortError into a timeout diagnostic", async () => {
    global.fetch = async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        }, { once: true });
    });

    await assert.rejects(fetchIJudge("/courses", {}, undefined, 5), /timed out/);
});

test("fetchIJudge converts other fetch failures into a connection diagnostic", async () => {
    global.fetch = async () => {
        throw new Error("private transport details");
    };

    await assert.rejects(
        fetchIJudge("/courses"),
        (error) => error.message === "Could not connect to iJudge."
    );
});

test("recognizes supported redirect status codes", () => {
    for (const status of [301, 302, 303, 307, 308]) {
        assert.equal(isRedirect(status), true);
    }
    for (const status of [200, 304, 400, 401, 403]) {
        assert.equal(isRedirect(status), false);
    }
});

test("401 is treated as session expiration but 403 is not", () => {
    assert.equal(isSessionExpiredResponse(new Response("", { status: 401 })), true);
    assert.equal(isSessionExpiredResponse(new Response("", { status: 403 })), false);
});

test("same-origin redirect to signin is treated as session expiration", () => {
    const response = new Response("", { status: 302, headers: { location: "/signin?next=%2Fcourses" } });
    assert.equal(isSessionExpiredResponse(response), true);
});

test("external redirect to a signin-looking path is not treated as session expiration", () => {
    const response = new Response("", { status: 302, headers: { location: "https://example.com/signin" } });
    assert.equal(isSessionExpiredResponse(response), false);
});

test("only the explicit action-not-found header marks a stale Server Action", () => {
    assert.equal(
        isActionNotFoundResponse(new Response("", { status: 404, headers: { "x-nextjs-action-not-found": "1" } })),
        true
    );
    assert.equal(isActionNotFoundResponse(new Response("", { status: 404 })), false);
    assert.equal(
        isActionNotFoundResponse(new Response("", { status: 500, headers: { "x-nextjs-action-not-found": "0" } })),
        false
    );
});

test("assertAuthenticatedResponse throws SessionExpiredError for an expired session", () => {
    assert.throws(
        () => assertAuthenticatedResponse(new Response("", { status: 401 })),
        (error) => error instanceof SessionExpiredError
    );
});

test("assertAuthenticatedResponse rejects unexpected redirects without following them", () => {
    assert.throws(
        () => assertAuthenticatedResponse(new Response("", { status: 302, headers: { location: "/elsewhere" } })),
        /Unexpected iJudge redirect/
    );
});

test("readTextLimited rejects a response whose declared content length is too large", async () => {
    const response = new Response("123456", { headers: { "content-length": "6" } });
    await assert.rejects(readTextLimited(response, 5, "test response"), /safe size limit/);
});

test("readTextLimited enforces actual byte size even without content-length", async () => {
    const response = new Response("éé");
    await assert.rejects(readTextLimited(response, 3, "test response"), /safe size limit/);
});

test("readTextLimited returns content within the configured bound", async () => {
    assert.equal(await readTextLimited(new Response("hello"), 5), "hello");
});
