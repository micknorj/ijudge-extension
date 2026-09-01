const test = require("node:test");
const assert = require("node:assert/strict");

const {
    averageExecutionMs,
    calculateQualityPercent,
    determineSubmissionStatus,
    parseSubmissionResult,
} = require("../out/submission-result.js");


const plain = `
{"cps_id":123,"result":"P","score":100,"pep8_score":8,
"testcase_id":1,"result":"P","execution":0.01,
"testcase_id":2,"result":"P","execution":0.03}
`;


test(
    "parses a completed plain submission response",
    () => {
        const result = parseSubmissionResult(123, plain);
        assert.ok(result);
        assert.equal(result.submissionId, 123);
        assert.equal(result.score, 100);
        assert.equal(result.records.length, 2);
    }
);


test(
    "parses escaped Next.js submission data",
    () => {
        const escaped = String.raw`\"cps_id\":123,\"result\":\"P\",\"score\":100,\"pep8_score\":8,\"testcase_id\":1,\"result\":\"P\",\"execution\":0.02`;
        const result = parseSubmissionResult(123, escaped);
        assert.ok(result);
        assert.equal(result.records[0].execution, 0.02);
    }
);


test(
    "returns undefined while judging",
    () => {
        const source = `{"cps_id":123,"result":"Judging","score":0,"testcase_id":1,"result":"P","execution":0.01}`;
        assert.equal(parseSubmissionResult(123, source), undefined);
    }
);


test(
    "does not parse another submission ID",
    () => {
        assert.equal(parseSubmissionResult(999, plain), undefined);
    }
);


test(
    "detects a failed testcase",
    () => {
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
    }
);


test(
    "calculates quality using iJudge formula",
    () => {
        assert.equal(calculateQualityPercent(8), 90);
    }
);


test(
    "calculates average execution in milliseconds",
    () => {
        const result = {
            submissionId: 1,
            result: "P",
            score: 100,
            qualityScore: undefined,
            records: [
                { testcaseId: 1, result: "P", execution: 0.01 },
                { testcaseId: 2, result: "P", execution: 0.03 },
            ],
        };

        assert.equal(averageExecutionMs(result), 20);
    }
);


test(
    "returns undefined average when execution is unavailable",
    () => {
        const result = {
            submissionId: 1,
            result: "P",
            score: 100,
            qualityScore: undefined,
            records: [
                { testcaseId: 1, result: "P", execution: undefined },
            ],
        };

        assert.equal(averageExecutionMs(result), undefined);
    }
);
