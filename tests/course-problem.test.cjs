const assert =
    require("node:assert/strict");

const {
    test,
} =
    require("node:test");

const {
    parseCoursesResponse,
} =
    require("../out/courses.js");

const {
    parseCourseProblemsResponse,
    validateAssignment,
} =
    require("../out/problems.js");


test(
    "parses enrolled course metadata",
    () => {
        const response =
            [
                '"courseId":78,' +
                '"courseName":"[2026] Problem Solving",' +
                '"enrolled":true',

                '"courseId":84,' +
                '"courseName":"Midterm",' +
                '"enrolled":true',
            ].join(
                " "
            );

        const courses =
            parseCoursesResponse(
                response
            );

        assert.equal(
            courses.length,
            2
        );

        assert.deepEqual(
            courses[0],
            {
                id: 78,
                name:
                    "[2026] Problem Solving",
                enrolled:
                    true,
            }
        );
    }
);


test(
    "deduplicates course IDs",
    () => {
        const response =
            '"courseId":78,' +
            '"courseName":"Course A",' +
            '"enrolled":true ' +
            '"courseId":78,' +
            '"courseName":"Course A",' +
            '"enrolled":true';

        assert.equal(
            parseCoursesResponse(
                response
            ).length,
            1
        );
    }
);


test(
    "rejects malformed course responses",
    () => {
        assert.throws(
            () =>
                parseCoursesResponse(
                    "not course data"
                ),
            /course list/
        );
    }
);


test(
    "parses normal assignment metadata",
    () => {
        const response =
            [
                '{"cp_id":3155,' +
                '"cp_problem_id":6102,' +
                '"cp_title":"ลูกน้ำ",' +
                '"cp_submission_limit":0,' +
                '"cp_release_time":"2026-08-07T09:00:00.000Z",' +
                '"cp_expired_time":"2026-09-04T00:00:00.000Z",' +
                '"cp_lang_type":"Python",' +
                '"cp_total_score":100,' +
                '"cp_is_disable_submit":0}',

                '"courseId":78,' +
                '"isExam":false',
            ].join(
                " "
            );

        const data =
            parseCourseProblemsResponse(
                response,
                78
            );

        assert.equal(
            data.isExam,
            false
        );

        assert.equal(
            data.problems.length,
            1
        );

        assert.equal(
            data.problems[0].id,
            3155
        );

        assert.equal(
            data.problems[0].title,
            "ลูกน้ำ"
        );

        assert.equal(
            data.problems[0].language,
            "Python"
        );

        assert.equal(
            data.problems[0].submitDisabled,
            false
        );
    }
);


test(
    "rejects a mismatched course response",
    () => {
        const response =
            '"courseId":99,"isExam":false';

        assert.throws(
            () =>
                parseCourseProblemsResponse(
                    response,
                    78
                ),
            /problem list/
        );
    }
);


test(
    "blocks exam-labelled assignments",
    () => {
        const error =
            validateAssignment({
                id: 1,
                title:
                    "[ MIDTERM ] Example",
                language:
                    "Python",
                releaseTime:
                    new Date(
                        "2000-01-01"
                    ),
                expireTime:
                    new Date(
                        "2999-01-01"
                    ),
                submitDisabled:
                    false,
            });

        assert.match(
            error,
            /Exam-labelled/
        );
    }
);