const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const client = require("../out/client.js");
const {
    clearCourseCache,
    getEnrolledCourses,
    parseCoursesResponse,
} = require("../out/courses.js");
const {
    clearProblemCache,
    findAssignment,
    parseCourseProblemsResponse,
    validateAssignment,
} = require("../out/problems.js");
const { IJudgeCompatibilityError } = require("../out/errors.js");

const originalFetchAuthenticatedPage = client.fetchAuthenticatedPage;

afterEach(() => {
    client.fetchAuthenticatedPage = originalFetchAuthenticatedPage;
    clearCourseCache();
    clearProblemCache();
});

function nextPayload(text) {
    return `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
}

function problem(overrides = {}) {
    return {
        id: 3155,
        title: "Normal Problem",
        language: "Python",
        releaseTime: new Date(Date.now() - 60_000),
        expireTime: new Date(Date.now() + 60_000),
        submitDisabled: false,
        ...overrides,
    };
}

function courseProblemSource(courseId, { isExam = false, cpId = 3155, cpProblemId = 6102, title = "Example" } = {}) {
    return [
        `{"cp_problem_id":${cpProblemId},"cp_title":${JSON.stringify(title)},"cp_release_time":"2026-01-01T00:00:00.000Z","cp_id":${cpId},"cp_expired_time":"2027-01-01T00:00:00.000Z","cp_lang_type":"Python","cp_is_disable_submit":0}`,
        `{"isExam":${isExam},"courseId":${courseId}}`,
    ].join("");
}

test("parses enrolled course metadata from a Next.js payload", () => {
    const source = nextPayload(`{"courseId":78,"courseName":"Programming","enrolled":true}`);
    assert.deepEqual(parseCoursesResponse(source), [
        { id: 78, name: "Programming", enrolled: true },
    ]);
});

test("course parsing does not depend on field order", () => {
    const source = `{"enrolled":true,"courseName":"Course A","courseId":78}`;
    assert.deepEqual(parseCoursesResponse(source), [
        { id: 78, name: "Course A", enrolled: true },
    ]);
});

test("course parsing preserves the older minimal serialized compatibility path", () => {
    const source = `fragment "courseId":78,"courseName":"Course A","enrolled":true tail`;
    assert.deepEqual(parseCoursesResponse(source), [
        { id: 78, name: "Course A", enrolled: true },
    ]);
});

test("deduplicates course IDs", () => {
    const source = [
        `{"courseId":78,"courseName":"Programming","enrolled":true}`,
        `{"courseId":78,"courseName":"Duplicate","enrolled":true}`,
    ].join("");
    const courses = parseCoursesResponse(source);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].id, 78);
});

test("rejects malformed course responses with a compatibility error", () => {
    assert.throws(
        () => parseCoursesResponse("not a course response"),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "COURSE_DATA_UNRECOGNIZED"
    );
});

test("getEnrolledCourses filters unenrolled courses, caches results and returns defensive clones", async () => {
    let fetches = 0;
    client.fetchAuthenticatedPage = async (path, token) => {
        fetches++;
        assert.equal(path, "/courses");
        assert.equal(token, "synthetic-session");
        return [
            `{"courseId":78,"courseName":"Programming","enrolled":true}`,
            `{"courseId":79,"courseName":"Other","enrolled":false}`,
        ].join("");
    };

    const first = await getEnrolledCourses("synthetic-session");
    assert.deepEqual(first, [{ id: 78, name: "Programming", enrolled: true }]);
    first[0].name = "mutated";

    const second = await getEnrolledCourses("synthetic-session");
    assert.equal(fetches, 1);
    assert.equal(second[0].name, "Programming");
});

test("parses normal assignment metadata using cp_id rather than cp_problem_id", () => {
    const parsed = parseCourseProblemsResponse(courseProblemSource(78), 78);
    assert.equal(parsed.isExam, false);
    assert.equal(parsed.problems.length, 1);
    assert.equal(parsed.problems[0].id, 3155);
    assert.notEqual(parsed.problems[0].id, 6102);
    assert.equal(parsed.problems[0].title, "Example");
    assert.equal(parsed.problems[0].language, "Python");
    assert.equal(parsed.problems[0].submitDisabled, false);
});

test("problem parsing does not depend on field order", () => {
    const source = [
        `{"cp_lang_type":"Python","cp_is_disable_submit":0,"cp_expired_time":"2027-01-01T00:00:00.000Z","cp_id":3155,"cp_release_time":"2026-01-01T00:00:00.000Z","cp_title":"Example"}`,
        `{"courseId":78,"isExam":false}`,
    ].join("");
    const parsed = parseCourseProblemsResponse(source, 78);
    assert.equal(parsed.problems[0].id, 3155);
});

test("problem parsing accepts a boolean disabled flag", () => {
    const source = [
        `{"cp_id":3155,"cp_title":"Example","cp_release_time":"2026-01-01T00:00:00.000Z","cp_expired_time":"2027-01-01T00:00:00.000Z","cp_lang_type":"Python","cp_is_disable_submit":true}`,
        `{"courseId":78,"isExam":false}`,
    ].join("");
    const parsed = parseCourseProblemsResponse(source, 78);
    assert.equal(parsed.problems[0].submitDisabled, true);
});

test("problem parsing ignores malformed problem records while preserving valid records", () => {
    const source = [
        `{"cp_id":1,"cp_title":"Bad date","cp_release_time":"invalid","cp_expired_time":"2027-01-01T00:00:00.000Z","cp_lang_type":"Python","cp_is_disable_submit":0}`,
        `{"cp_id":2,"cp_title":"Good","cp_release_time":"2026-01-01T00:00:00.000Z","cp_expired_time":"2027-01-01T00:00:00.000Z","cp_lang_type":"Python","cp_is_disable_submit":0}`,
        `{"courseId":78,"isExam":false}`,
    ].join("");
    const parsed = parseCourseProblemsResponse(source, 78);
    assert.deepEqual(parsed.problems.map((item) => item.id), [2]);
});

test("rejects a mismatched course response with a compatibility error", () => {
    assert.throws(
        () => parseCourseProblemsResponse(`{"courseId":79,"isExam":false}`, 78),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "PROBLEM_DATA_UNRECOGNIZED"
    );
});

test("rejects problem data without explicit exam state", () => {
    assert.throws(
        () => parseCourseProblemsResponse(`{"courseId":78}`, 78),
        (error) => error instanceof IJudgeCompatibilityError && error.code === "PROBLEM_DATA_UNRECOGNIZED"
    );
});

test("allows a normal eligible Python assignment", () => {
    assert.equal(validateAssignment(problem()), undefined);
});

test("allows eligible assignments regardless of exam wording in the problem title", () => {
    for (const title of ["Midterm Problem", "Final exam", "Examination 1"]) {
        assert.equal(validateAssignment(problem({ title })), undefined);
    }
});

test("blocks disabled submissions", () => {
    assert.match(
        validateAssignment(problem({ title: "Final Exam Practice", submitDisabled: true })),
        /disabled/
    );
});

test("blocks unreleased assignments", () => {
    assert.match(
        validateAssignment(problem({
            title: "Final Exam Practice",
            releaseTime: new Date(Date.now() + 60_000),
            expireTime: new Date(Date.now() + 120_000),
        })),
        /not been released/
    );
});

test("blocks expired assignments", () => {
    assert.match(
        validateAssignment(problem({
            title: "Final Exam Practice",
            releaseTime: new Date(Date.now() - 120_000),
            expireTime: new Date(Date.now() - 60_000),
        })),
        /no longer accepting/
    );
});

test("blocks non-Python assignments", () => {
    assert.match(
        validateAssignment(problem({ title: "Final Exam Practice", language: "C++" })),
        /not Python/
    );
});

test("finds an available exam-labelled assignment for normal validation", async () => {
    const fetched = [];
    client.fetchAuthenticatedPage = async (path) => {
        fetched.push(path);
        return courseProblemSource(78, {
            isExam: true,
            cpId: 3155,
            title: "Final Exam Practice",
        });
    };

    const match = await findAssignment(
        3155,
        [
            { id: 78, name: "Midterm Exam", enrolled: true },
            { id: 79, name: "Programming", enrolled: true },
        ],
        "synthetic-session"
    );

    assert.equal(match.course.id, 78);
    assert.equal(match.problem.title, "Final Exam Practice");
    assert.equal(validateAssignment(match.problem), undefined);
    assert.deepEqual(fetched, ["/courses/78/problems"]);
});

test("findAssignment returns undefined when enrolled course data does not expose the problem", async () => {
    const fetched = [];
    client.fetchAuthenticatedPage = async (path) => {
        fetched.push(path);
        return courseProblemSource(78, { cpId: 9999 });
    };

    const match = await findAssignment(
        3155,
        [
            { id: 78, name: "Programming", enrolled: true },
        ],
        "synthetic-session"
    );

    assert.equal(match, undefined);
    assert.deepEqual(fetched, ["/courses/78/problems"]);
});
