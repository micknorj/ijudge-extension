const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    findServerActionId,
    parseServerActionReferences,
} = require("../out/actions.js");

const {
    parseCoursesResponse,
} = require("../out/courses.js");

const {
    parseCourseProblemsResponse,
} = require("../out/problems.js");

const {
    averageExecutionMs,
} = require("../out/submission-result.js");


test(
    "discovers a 40-character Server Action ID",
    () => {
        const id = "a".repeat(40);
        const source = `(0,x.createServerReference)("${id}",x.callServer,void 0,x.findSourceMapURL,"signIn")`;

        assert.equal(
            findServerActionId(source, "signIn"),
            id
        );
    }
);


test(
    "discovers a 42-character Server Action ID",
    () => {
        const id = "b".repeat(42);
        const source = `(0,x.createServerReference)("${id}",x.callServer,void 0,x.findSourceMapURL,"signIn")`;

        assert.equal(
            findServerActionId(source, "signIn"),
            id
        );
    }
);


test(
    "treats Server Action IDs as opaque strings",
    () => {
        const id = "opaque-runtime-action-id_v2";
        const source = `(0,x.createServerReference)("${id}",x.callServer,void 0,x.findSourceMapURL,"submitCodeToServer")`;

        assert.equal(
            findServerActionId(source, "submitCodeToServer"),
            id
        );
    }
);


test(
    "selects actions by semantic reference name",
    () => {
        const source = [
            `(0,x.createServerReference)("login-id",x.callServer,void 0,x.findSourceMapURL,"signIn")`,
            `(0,x.createServerReference)("submit-id",x.callServer,void 0,x.findSourceMapURL,"submitCodeToServer")`,
            `(0,x.createServerReference)("other-id",x.callServer,void 0,x.findSourceMapURL,"somethingElse")`,
        ].join(";");

        assert.equal(findServerActionId(source, "signIn"), "login-id");
        assert.equal(findServerActionId(source, "submitCodeToServer"), "submit-id");
        assert.equal(parseServerActionReferences(source).length, 3);
    }
);


test(
    "ignores unrelated Server Actions",
    () => {
        const source = `(0,x.createServerReference)("other-id",x.callServer,void 0,x.findSourceMapURL,"otherAction")`;
        assert.equal(findServerActionId(source, "signIn"), undefined);
    }
);


test(
    "rejects ambiguous semantic Server Action matches",
    () => {
        const source = [
            `(0,x.createServerReference)("first-id",x.callServer,void 0,x.findSourceMapURL,"signIn")`,
            `(0,x.createServerReference)("second-id",x.callServer,void 0,x.findSourceMapURL,"signIn")`,
        ].join(";");

        assert.throws(
            () => findServerActionId(source, "signIn"),
            /Multiple iJudge Server Actions/
        );
    }
);


test(
    "source contains no hard-coded Server Action fallback constants",
    () => {
        const source = fs.readFileSync(
            path.join(__dirname, "..", "src", "actions.ts"),
            "utf8"
        );

        assert.doesNotMatch(source, /FALLBACK_LOGIN_ACTION/);
        assert.doesNotMatch(source, /FALLBACK_SUBMIT_ACTION/);
        assert.doesNotMatch(source, /\[0-9a-f\]\{40\}/i);
    }
);


test(
    "course parsing does not depend on field order",
    () => {
        const source = `{"enrolled":true,"courseName":"Course A","courseId":78}`;

        assert.deepEqual(
            parseCoursesResponse(source),
            [
                {
                    id: 78,
                    name: "Course A",
                    enrolled: true,
                },
            ]
        );
    }
);


test(
    "problem parsing does not depend on field order",
    () => {
        const source = [
            `{"cp_lang_type":"Python","cp_is_disable_submit":0,"cp_expired_time":"2027-01-01T00:00:00.000Z","cp_id":3155,"cp_release_time":"2026-01-01T00:00:00.000Z","cp_title":"Example"}`,
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
    "average execution ignores missing execution values",
    () => {
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
    }
);


test(
    "runtime source contains no embedded production-style Server Action IDs",
    () => {
        const srcDir = path.join(__dirname, "..", "src");
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith(".ts"));

        for (const file of files) {
            const source = fs.readFileSync(path.join(srcDir, file), "utf8");
            assert.doesNotMatch(
                source,
                /["'][0-9a-f]{40,512}["']/i,
                `${file} contains a production-style Server Action literal`
            );
        }
    }
);


test(
    "runtime source does not construct private Next.js _rsc requests",
    () => {
        const srcDir = path.join(__dirname, "..", "src");
        const source = fs.readdirSync(srcDir)
            .filter((name) => name.endsWith(".ts"))
            .map((name) => fs.readFileSync(path.join(srcDir, name), "utf8"))
            .join("\n");

        assert.doesNotMatch(source, /createRscKey/);
        assert.doesNotMatch(source, /searchParams\.set\(\s*["']_rsc["']/);
    }
);
