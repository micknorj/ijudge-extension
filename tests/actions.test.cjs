const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
    clearActionCache,
    findServerActionId,
    findServerActionIdAcrossSources,
    getLoginAction,
    getSubmitAction,
    parseServerActionReferences,
} = require("../out/actions.js");
const { IJudgeCompatibilityError } = require("../out/errors.js");

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    clearActionCache();
});

function actionRef(id, name) {
    return `(0,x.createServerReference)(${JSON.stringify(id)},x.callServer,void 0,x.findSourceMapURL,${JSON.stringify(name)})`;
}

function pageWithScripts(...scripts) {
    return scripts.map((src) => `<script src="${src}"></script>`).join("");
}

test("discovers Server Action IDs of different lengths", () => {
    for (const length of [1, 40, 42, 127, 512]) {
        const id = `id-${"x".repeat(Math.max(0, length - 3))}`.slice(0, length);
        assert.equal(findServerActionId(actionRef(id, "signIn"), "signIn"), id);
    }
});

test("treats Server Action IDs as opaque non-hex strings", () => {
    const id = "opaque-runtime_action-ID.v2:+/=";
    assert.equal(findServerActionId(actionRef(id, "submitCodeToServer"), "submitCodeToServer"), id);
});

test("selects actions by semantic reference name and ignores unrelated actions", () => {
    const source = [
        actionRef("login-synthetic", "signIn"),
        actionRef("submit-synthetic", "submitCodeToServer"),
        actionRef("other-synthetic", "somethingElse"),
    ].join(";");

    assert.equal(findServerActionId(source, "signIn"), "login-synthetic");
    assert.equal(findServerActionId(source, "submitCodeToServer"), "submit-synthetic");
    assert.equal(findServerActionId(source, "missing"), undefined);
});

test("parses both direct and minified createServerReference invocation forms", () => {
    const source = [
        `x.createServerReference("direct-id",x.callServer,void 0,x.findSourceMapURL,"signIn")`,
        actionRef("minified-id", "submitCodeToServer"),
    ].join(";");

    assert.deepEqual(parseServerActionReferences(source), [
        { id: "direct-id", name: "signIn" },
        { id: "minified-id", name: "submitCodeToServer" },
    ]);
});

test("deduplicates repeated identical action references", () => {
    const reference = actionRef("same-id", "signIn");
    assert.deepEqual(parseServerActionReferences(`${reference};${reference}`), [
        { id: "same-id", name: "signIn" },
    ]);
});

test("accepts the same semantic action ID repeated across multiple sources", () => {
    assert.equal(
        findServerActionIdAcrossSources(
            [actionRef("same-id", "signIn"), actionRef("same-id", "signIn")],
            "signIn"
        ),
        "same-id"
    );
});

test("rejects conflicting semantic action IDs across sources without exposing the IDs", () => {
    const first = "synthetic-first-action";
    const second = "synthetic-second-action";

    assert.throws(
        () => findServerActionIdAcrossSources(
            [actionRef(first, "signIn"), actionRef(second, "signIn")],
            "signIn"
        ),
        (error) => {
            assert.ok(error instanceof IJudgeCompatibilityError);
            assert.equal(error.code, "ACTION_AMBIGUOUS");
            assert.doesNotMatch(error.message, new RegExp(first));
            assert.doesNotMatch(error.message, new RegExp(second));
            return true;
        }
    );
});

test("ignores unusable empty, padded, control-character and oversized action IDs", () => {
    const oversized = "x".repeat(513);
    const source = [
        actionRef("", "signIn"),
        actionRef(" padded ", "signIn"),
        actionRef("control\nvalue", "signIn"),
        actionRef(oversized, "signIn"),
    ].join(";");

    assert.equal(findServerActionId(source, "signIn"), undefined);
});

test("discovers an inline login action when the frontend has no scripts", async () => {
    global.fetch = async (url, init) => {
        assert.equal(url, "https://ijudge.it.kmitl.ac.th/signin");
        assert.equal(new Headers(init.headers).get("Cookie"), null);
        return new Response(actionRef("inline-login", "signIn"), { status: 200 });
    };

    assert.equal(await getLoginAction(), "inline-login");
});

test("discovers a submission action from a same-origin script without sending the session cookie to the script", async () => {
    const calls = [];
    global.fetch = async (url, init) => {
        calls.push({ url, headers: new Headers(init.headers) });

        if (url.includes("/problems/3155/description")) {
            return new Response(pageWithScripts("/_next/static/chunks/problems-description.js"), { status: 200 });
        }

        if (url.endsWith("/problems-description.js")) {
            return new Response(actionRef("script-submit", "submitCodeToServer"), { status: 200 });
        }

        throw new Error(`unexpected URL ${url}`);
    };

    assert.equal(await getSubmitAction(3155, "synthetic-session"), "script-submit");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers.get("Cookie"), "access_token=synthetic-session");
    assert.equal(calls[1].headers.get("Cookie"), null);
});

test("ignores external script resources during action discovery", async () => {
    const urls = [];
    global.fetch = async (url) => {
        urls.push(url);
        return new Response(
            pageWithScripts("https://example.com/untrusted.js") + actionRef("inline-login", "signIn"),
            { status: 200 }
        );
    };

    assert.equal(await getLoginAction(), "inline-login");
    assert.deepEqual(urls, ["https://ijudge.it.kmitl.ac.th/signin"]);
});

test("fails closed when a referenced frontend script cannot be inspected", async () => {
    global.fetch = async (url) => {
        if (url.endsWith("/signin")) {
            return new Response(
                actionRef("inline-login", "signIn") + pageWithScripts("/_next/static/chunks/missing.js"),
                { status: 200 }
            );
        }
        return new Response("missing", { status: 500 });
    };

    await assert.rejects(
        getLoginAction(),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "ACTION_SCAN_INCOMPLETE"
    );
});

test("fails closed when more frontend scripts are referenced than can be safely inspected", async () => {
    let calls = 0;
    global.fetch = async () => {
        calls++;
        const scripts = Array.from({ length: 51 }, (_, index) => `/_next/static/chunks/chunk-${index}.js`);
        return new Response(pageWithScripts(...scripts), { status: 200 });
    };

    await assert.rejects(
        getLoginAction(),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "ACTION_SCAN_INCOMPLETE"
    );
    assert.equal(calls, 1);
});

test("fails closed when page and script disagree on the required action", async () => {
    global.fetch = async (url) => {
        if (url.endsWith("/signin")) {
            return new Response(
                actionRef("page-login", "signIn") + pageWithScripts("/_next/static/chunks/signin.js"),
                { status: 200 }
            );
        }
        return new Response(actionRef("script-login", "signIn"), { status: 200 });
    };

    await assert.rejects(
        getLoginAction(),
        (error) => {
            assert.ok(error instanceof IJudgeCompatibilityError);
            assert.equal(error.code, "ACTION_AMBIGUOUS");
            assert.doesNotMatch(error.message, /page-login|script-login/);
            return true;
        }
    );
});

test("fails with ACTION_NOT_FOUND when the required semantic action is absent", async () => {
    global.fetch = async () => new Response(actionRef("other-id", "somethingElse"), { status: 200 });

    await assert.rejects(
        getLoginAction(),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "ACTION_NOT_FOUND"
    );
});

test("action cache avoids repeat discovery until cleared", async () => {
    let calls = 0;
    global.fetch = async () => {
        calls++;
        return new Response(actionRef("cached-login", "signIn"), { status: 200 });
    };

    assert.equal(await getLoginAction(), "cached-login");
    assert.equal(await getLoginAction(), "cached-login");
    assert.equal(calls, 1);

    clearActionCache();
    assert.equal(await getLoginAction(), "cached-login");
    assert.equal(calls, 2);
});
