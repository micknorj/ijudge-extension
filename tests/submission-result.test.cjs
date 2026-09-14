const test = require("node:test");
const assert = require("node:assert/strict");

const {
    averageExecutionMs,
    calculateQualityPercent,
    determineSubmissionStatus,
    formatScore,
    parseSubmissionResult,
    testcaseResultName,
} = require("../out/submission-result.js");

const plain = `
{"cps_id":123,"result":"P","score":100,"pep8_score":8,
"testcase_id":1,"result":"P","execution":0.01,
"testcase_id":2,"result":"P","execution":0.03}
`;

test("parses a completed plain submission response", () => {
    const result = parseSubmissionResult(123, plain);
    assert.ok(result);
    assert.equal(result.submissionId, 123);
    assert.equal(result.result, "P");
    assert.equal(result.score, 100);
    assert.equal(result.qualityScore, 8);
    assert.equal(result.records.length, 2);
});

test("parses escaped Next.js submission data", () => {
    const escaped = String.raw`\"cps_id\":123,\"result\":\"P\",\"score\":100,\"pep8_score\":8,\"testcase_id\":1,\"result\":\"P\",\"execution\":0.02`;
    const result = parseSubmissionResult(123, escaped);
    assert.ok(result);
    assert.equal(result.records[0].execution, 0.02);
});

test("returns undefined while judging", () => {
    const source = `{"cps_id":123,"result":"Judging","score":0,"testcase_id":1,"result":"P","execution":0.01}`;
    assert.equal(parseSubmissionResult(123, source), undefined);
});

test("does not parse another submission ID", () => {
    assert.equal(parseSubmissionResult(999, plain), undefined);
});

test("requires score and at least one testcase record", () => {
    assert.equal(parseSubmissionResult(123, `{"cps_id":123,"result":"P","testcase_id":1,"result":"P","execution":0.01}`), undefined);
    assert.equal(parseSubmissionResult(123, `{"cps_id":123,"result":"P","score":100}`), undefined);
});

test("deduplicates testcase IDs and sorts them numerically", () => {
    const source = `
{"cps_id":123,"result":"P","score":100,
"testcase_id":2,"result":"P","execution":0.02,
"testcase_id":1,"result":"P","execution":0.01,
"testcase_id":2,"result":"-","execution":0.99}
`;
    const result = parseSubmissionResult(123, source);
    assert.deepEqual(result.records.map((record) => record.testcaseId), [1, 2]);
    assert.equal(result.records[1].result, "P");
});

test("parses null execution as unavailable", () => {
    const source = `{"cps_id":123,"result":"P","score":100,"testcase_id":1,"result":"P","execution":null}`;
    const result = parseSubmissionResult(123, source);
    assert.ok(result);
    assert.equal(result.records[0].execution, undefined);
});

test("detects a failed testcase", () => {
    const result = {
        submissionId: 1,
        result: "-",
        score: 50,
        qualityScore: undefined,
        records: [
            { testcaseId: 1, result: "P", execution: 0.01 },
            { testcaseId: 2, result: "-", execution: 0.01 },
        ],
    };
    assert.equal(determineSubmissionStatus(result), "Not Passed");
});

test("reports passed only when every testcase passed", () => {
    assert.equal(determineSubmissionStatus({ submissionId: 1, result: "P", score: 100, qualityScore: undefined, records: [{ testcaseId: 1, result: "P", execution: 0.01 }] }), "Passed");
    assert.equal(determineSubmissionStatus({ submissionId: 1, result: "P", score: 100, qualityScore: undefined, records: [] }), "Not Passed");
});

test("calculates quality using the iJudge formula", () => {
    assert.equal(calculateQualityPercent(8), 90);
    assert.equal(calculateQualityPercent(10), 100);
});

test("calculates average execution in milliseconds while ignoring missing values", () => {
    const result = {
        submissionId: 1,
        result: "P",
        score: 100,
        qualityScore: undefined,
        records: [
            { testcaseId: 1, result: "P", execution: 0.1 },
            { testcaseId: 2, result: "P", execution: undefined },
            { testcaseId: 3, result: "P", execution: 0.3 },
        ],
    };
    assert.equal(averageExecutionMs(result), 200);
});

test("returns undefined average when execution is unavailable", () => {
    const result = { submissionId: 1, result: "P", score: 100, qualityScore: undefined, records: [{ testcaseId: 1, result: "P", execution: undefined }] };
    assert.equal(averageExecutionMs(result), undefined);
});

test("formats scores with at most three fractional digits", () => {
    assert.equal(formatScore(12.34567), "12.346");
});

test("maps testcase result codes to user-facing names", () => {
    assert.equal(testcaseResultName("P"), "Passed");
    assert.equal(testcaseResultName("-"), "Incorrect");
    assert.equal(testcaseResultName("T"), "Timeout");
    assert.equal(testcaseResultName("R"), "Restrict/Require Word");
    assert.equal(testcaseResultName("?"), "Error");
});
