const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const actions = require("../out/actions.js");
const http = require("../out/http.js");
const submissions = require("../out/submissions.js");
const { SessionExpiredError } = require("../out/errors.js");

const originals = {
    getSubmitAction: actions.getSubmitAction,
    invalidateSubmitAction: actions.invalidateSubmitAction,
    fetchIJudge: http.fetchIJudge,
};

afterEach(() => {
    actions.getSubmitAction = originals.getSubmitAction;
    actions.invalidateSubmitAction = originals.invalidateSubmitAction;
    http.fetchIJudge = originals.fetchIJudge;
});

function successfulSubmission(id = 123) {
    return new Response(JSON.stringify({ success: true, submissionId: id }), { status: 200 });
}

test("submitSource sends cp_id as course_problem_id and never substitutes cp_problem_id", async () => {
    let request;
    actions.getSubmitAction = async (problemId, token) => {
        assert.equal(problemId, 3155);
        assert.equal(token, "synthetic-session");
        return "synthetic-submit-action";
    };
    http.fetchIJudge = async (path, options, token, timeout) => {
        request = { path, options, token, timeout };
        return successfulSubmission(123);
    };

    const id = await submissions.submitSource({
        problemId: 3155,
        courseId: 78,
        language: "Python",
        code: "print('test')",
        accessToken: "synthetic-session",
    });

    assert.equal(id, 123);
    assert.equal(request.path, "/problems/3155/description?problemPage=0");
    assert.equal(request.token, "synthetic-session");
    assert.equal(request.timeout, 30_000);
    assert.equal(new Headers(request.options.headers).get("Next-Action"), "synthetic-submit-action");

    const payload = JSON.parse(request.options.body);
    assert.equal(payload[0].course_problem_id, 3155);
    assert.equal(payload[0].course_id, 78);
    assert.equal(Object.prototype.hasOwnProperty.call(payload[0], "cp_problem_id"), false);
});

test("submission retries once only after the explicit stale-action response", async () => {
    let fetches = 0;
    let discoveries = 0;
    let invalidations = 0;
    actions.getSubmitAction = async () => `synthetic-submit-${++discoveries}`;
    actions.invalidateSubmitAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return fetches === 1
            ? new Response("", { status: 404, headers: { "x-nextjs-action-not-found": "1" } })
            : successfulSubmission(321);
    };

    const id = await submissions.submitSource({
        problemId: 3155,
        courseId: 78,
        language: "Python",
        code: "print('test')",
        accessToken: "synthetic-session",
    });

    assert.equal(id, 321);
    assert.equal(fetches, 2);
    assert.equal(discoveries, 2);
    assert.equal(invalidations, 1);
});

test("a second explicit stale-action response stops instead of retrying again", async () => {
    let fetches = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    actions.invalidateSubmitAction = () => {};
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 404, headers: { "x-nextjs-action-not-found": "1" } });
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        /submission action could not be used/
    );
    assert.equal(fetches, 2);
});

test("generic 404 does not retry submission", async () => {
    let fetches = 0;
    let invalidations = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    actions.invalidateSubmitAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 404 });
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        /HTTP 404/
    );
    assert.equal(fetches, 1);
    assert.equal(invalidations, 0);
});

test("403 access restrictions do not retry submission or masquerade as session expiration", async () => {
    let fetches = 0;
    let invalidations = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    actions.invalidateSubmitAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 403 });
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        (error) => !(error instanceof SessionExpiredError) && /HTTP 403/.test(error.message)
    );
    assert.equal(fetches, 1);
    assert.equal(invalidations, 0);
});

test("5xx does not retry submission", async () => {
    let fetches = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    http.fetchIJudge = async () => {
        fetches++;
        return new Response("", { status: 503 });
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        /HTTP 503/
    );
    assert.equal(fetches, 1);
});

test("network failure does not retry submission", async () => {
    let fetches = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    http.fetchIJudge = async () => {
        fetches++;
        throw new Error("Could not connect to iJudge.");
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        /Could not connect/
    );
    assert.equal(fetches, 1);
});

test("unconfirmed 200 response fails conservatively without submission retry", async () => {
    let fetches = 0;
    let invalidations = 0;
    actions.getSubmitAction = async () => "synthetic-submit";
    actions.invalidateSubmitAction = () => { invalidations++; };
    http.fetchIJudge = async () => {
        fetches++;
        return new Response(JSON.stringify({ success: false, submissionId: 123 }), { status: 200 });
    };

    await assert.rejects(
        submissions.submitSource({ problemId: 3155, courseId: 78, language: "Python", code: "x", accessToken: "synthetic-session" }),
        /did not confirm the submission/
    );
    assert.equal(fetches, 1);
    assert.equal(invalidations, 1);
});

test("fetchSubmissionResult returns undefined for a missing result page", async () => {
    http.fetchIJudge = async () => new Response("", { status: 404 });
    assert.equal(await submissions.fetchSubmissionResult(123, "synthetic-session"), undefined);
});

test("fetchSubmissionResult parses a completed result", async () => {
    http.fetchIJudge = async () => new Response(
        `{"cps_id":123,"result":"P","score":100,"testcase_id":1,"result":"P","execution":0.01}`,
        { status: 200 }
    );
    const result = await submissions.fetchSubmissionResult(123, "synthetic-session");
    assert.equal(result.submissionId, 123);
    assert.equal(result.score, 100);
});

test("fetchSubmissionResult propagates session expiration", async () => {
    http.fetchIJudge = async () => new Response("", { status: 401 });
    await assert.rejects(
        submissions.fetchSubmissionResult(123, "synthetic-session"),
        (error) => error instanceof SessionExpiredError
    );
});

test("waitForSubmission returns immediately when a completed result is available", async () => {
    http.fetchIJudge = async () => new Response(
        `{"cps_id":123,"result":"P","score":100,"testcase_id":1,"result":"P","execution":0.01}`,
        { status: 200 }
    );
    const result = await submissions.waitForSubmission(123, "synthetic-session", undefined, 1000);
    assert.equal(result.submissionId, 123);
});
