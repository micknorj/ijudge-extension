const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseCoursesResponse,
} = require("../out/courses.js");

const {
    parseCourseProblemsResponse,
    validateAssignment,
} = require("../out/problems.js");


function nextPayload(text) {
    return `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
}


test(
    "parses enrolled course metadata",
    () => {
        const source = nextPayload(
            `{"courseId":78,"courseName":"Programming","enrolled":true}`
        );

        assert.deepEqual(
            parseCoursesResponse(source),
            [
                {
                    id: 78,
                    name: "Programming",
                    enrolled: true,
                },
            ]
        );
    }
);


test(
    "deduplicates course IDs",
    () => {
        const source = [
            `{"courseId":78,"courseName":"Programming","enrolled":true}`,
            `{"courseId":78,"courseName":"Programming duplicate","enrolled":true}`,
        ].join("");

        const courses = parseCoursesResponse(source);
        assert.equal(courses.length, 1);
        assert.equal(courses[0].id, 78);
    }
);


test(
    "rejects malformed course responses",
    () => {
        assert.throws(
            () => parseCoursesResponse("not a course response"),
            /Could not read the iJudge course list/
        );
    }
);


test(
    "parses normal assignment metadata",
    () => {
        const source = [
            `{"cp_id":3155,"cp_problem_id":6102,"cp_title":"Example","cp_release_time":"2026-01-01T00:00:00.000Z","cp_expired_time":"2027-01-01T00:00:00.000Z","cp_lang_type":"Python","cp_is_disable_submit":0}`,
            `{"courseId":78,"isExam":false}`,
        ].join("");

        const parsed = parseCourseProblemsResponse(source, 78);

        assert.equal(parsed.isExam, false);
        assert.equal(parsed.problems.length, 1);
        assert.equal(parsed.problems[0].id, 3155);
        assert.equal(parsed.problems[0].title, "Example");
        assert.equal(parsed.problems[0].language, "Python");
        assert.equal(parsed.problems[0].submitDisabled, false);
    }
);


test(
    "rejects a mismatched course response",
    () => {
        const source = `{"courseId":79,"isExam":false}`;

        assert.throws(
            () => parseCourseProblemsResponse(source, 78),
            /Could not read the iJudge problem list/
        );
    }
);


test(
    "blocks exam-labelled assignments",
    () => {
        const problem = {
            id: 1,
            title: "Midterm Problem",
            language: "Python",
            releaseTime: new Date(Date.now() - 60_000),
            expireTime: new Date(Date.now() + 60_000),
            submitDisabled: false,
        };

        assert.match(
            validateAssignment(problem),
            /Exam-labelled assignments/
        );
    }
);


test(
    "blocks disabled submissions",
    () => {
        const problem = {
            id: 1,
            title: "Normal Problem",
            language: "Python",
            releaseTime: new Date(Date.now() - 60_000),
            expireTime: new Date(Date.now() + 60_000),
            submitDisabled: true,
        };

        assert.match(validateAssignment(problem), /disabled/);
    }
);


test(
    "blocks unreleased assignments",
    () => {
        const problem = {
            id: 1,
            title: "Normal Problem",
            language: "Python",
            releaseTime: new Date(Date.now() + 60_000),
            expireTime: new Date(Date.now() + 120_000),
            submitDisabled: false,
        };

        assert.match(validateAssignment(problem), /not been released/);
    }
);


test(
    "blocks expired assignments",
    () => {
        const problem = {
            id: 1,
            title: "Normal Problem",
            language: "Python",
            releaseTime: new Date(Date.now() - 120_000),
            expireTime: new Date(Date.now() - 60_000),
            submitDisabled: false,
        };

        assert.match(validateAssignment(problem), /no longer accepting/);
    }
);


test(
    "blocks non-Python assignments",
    () => {
        const problem = {
            id: 1,
            title: "Normal Problem",
            language: "C++",
            releaseTime: new Date(Date.now() - 60_000),
            expireTime: new Date(Date.now() + 60_000),
            submitDisabled: false,
        };

        assert.match(validateAssignment(problem), /not Python/);
    }
);
