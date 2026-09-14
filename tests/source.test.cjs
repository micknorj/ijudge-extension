const test = require("node:test");
const assert = require("node:assert/strict");

const { detectProblemId } = require("../out/source.js");

test("detects triple-double-quote marker", () => {
    assert.equal(detectProblemId('"""3155"""\nprint("x")'), 3155);
});

test("detects triple-single-quote marker", () => {
    assert.equal(detectProblemId("'''3155'''\nprint('x')"), 3155);
});

test("detects numeric comment marker", () => {
    assert.equal(detectProblemId("# 3155\nprint('x')"), 3155);
});

test("detects explicit ijudge marker case-insensitively", () => {
    assert.equal(detectProblemId("# IJUDGE : 3155\nprint('x')"), 3155);
});

test("accepts UTF-8 BOM before the first-line marker", () => {
    assert.equal(detectProblemId("\uFEFF# 3155\nprint('x')"), 3155);
});

test("only the first line may contain the marker", () => {
    assert.equal(detectProblemId("print('x')\n# 3155"), undefined);
});

test("rejects invalid, zero, negative and nonnumeric problem IDs", () => {
    assert.equal(detectProblemId("# 0"), undefined);
    assert.equal(detectProblemId("# -1"), undefined);
    assert.equal(detectProblemId("# abc"), undefined);
    assert.equal(detectProblemId("# ijudge:"), undefined);
});

test("rejects trailing code on the marker line", () => {
    assert.equal(detectProblemId("# 3155 print('x')"), undefined);
    assert.equal(detectProblemId('"""3155"""; print("x")'), undefined);
});
