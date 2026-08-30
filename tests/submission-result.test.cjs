const assert =
    require("node:assert/strict");

const {
    test,
} =
    require("node:test");

const {
    averageExecutionMs,
    calculateQualityPercent,
    determineSubmissionStatus,
    parseSubmissionResult,
    testcaseResultName,
} =
    require(
        "../out/submission-result.js"
    );


const completedSubmission =
    [
        '"cps_id":623370,',
        '"result":"PP",',
        '"score":1000,',
        '"pep8_score":10,',
        '"records":[',
        '{"testcase_id":1,"result":"P","execution":0.010},',
        '{"testcase_id":2,"result":"P","execution":0.012}',
        "]",
    ].join(
        ""
    );


test(
    "parses a completed plain submission response",
    () => {
        const result =
            parseSubmissionResult(
                623370,
                completedSubmission
            );

        assert.ok(
            result
        );

        assert.equal(
            result.submissionId,
            623370
        );

        assert.equal(
            result.score,
            1000
        );

        assert.equal(
            result.qualityScore,
            10
        );

        assert.equal(
            result.records.length,
            2
        );

        assert.equal(
            determineSubmissionStatus(
                result
            ),
            "Passed"
        );
    }
);


test(
    "parses escaped Next.js submission data",
    () => {
        const escaped =
            completedSubmission.replaceAll(
                '"',
                '\\"'
            );

        const result =
            parseSubmissionResult(
                623370,
                escaped
            );

        assert.ok(
            result
        );

        assert.equal(
            result.records.length,
            2
        );

        assert.equal(
            result.records[0].result,
            "P"
        );
    }
);


test(
    "returns undefined while judging",
    () => {
        const result =
            parseSubmissionResult(
                123,
                '"cps_id":123,' +
                '"result":"Judging",' +
                '"score":0'
            );

        assert.equal(
            result,
            undefined
        );
    }
);


test(
    "does not parse another submission ID",
    () => {
        assert.equal(
            parseSubmissionResult(
                999,
                completedSubmission
            ),
            undefined
        );
    }
);


test(
    "detects a failed testcase",
    () => {
        const result =
            parseSubmissionResult(
                50,
                '"cps_id":50,' +
                '"result":"P-P",' +
                '"score":66.67,' +
                '"pep8_score":8.5,' +
                '"records":[' +
                '{"testcase_id":1,"result":"P","execution":0.01},' +
                '{"testcase_id":2,"result":"-","execution":0.02}' +
                "]"
            );

        assert.ok(
            result
        );

        assert.equal(
            determineSubmissionStatus(
                result
            ),
            "Not Passed"
        );

        assert.equal(
            testcaseResultName(
                "-"
            ),
            "Incorrect"
        );
    }
);


test(
    "calculates quality using iJudge formula",
    () => {
        assert.equal(
            calculateQualityPercent(
                10
            ),
            100
        );

        assert.equal(
            calculateQualityPercent(
                8.57
            ),
            92.85
        );
    }
);


test(
    "calculates average execution in milliseconds",
    () => {
        const result =
            parseSubmissionResult(
                10,
                '"cps_id":10,' +
                '"result":"PP",' +
                '"score":1000,' +
                '"records":[' +
                '{"testcase_id":1,"result":"P","execution":0.010},' +
                '{"testcase_id":2,"result":"P","execution":0.012}' +
                "]"
            );

        assert.ok(
            result
        );

        assert.equal(
            averageExecutionMs(
                result
            ),
            11
        );
    }
);