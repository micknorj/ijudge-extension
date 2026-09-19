const test = require("node:test");
const assert = require("node:assert/strict");

const {
    formatTerminalSection,
    sanitizeTerminalText,
} = require("../out/terminal-format.js");

test("formats compact terminal sections with aligned fields", () => {
    assert.deepEqual(
        formatTerminalSection(
            "Assignment",
            [
                { label: "Problem", value: "3155 - Example" },
                { label: "Course", value: "Programming" },
                { label: "Status", value: "Available" },
            ]
        ),
        [
            "Assignment",
            "----------",
            "Problem: 3155 - Example",
            "Course:  Programming",
            "Status:  Available",
        ]
    );
});

test("formats unlabelled section rows without box-width calculations", () => {
    assert.deepEqual(
        formatTerminalSection(
            "Restriction",
            ["This assignment is unavailable."]
        ),
        [
            "Restriction",
            "-----------",
            "This assignment is unavailable.",
        ]
    );
});

test("sanitizes control characters and terminal escape sequences", () => {
    assert.equal(
        sanitizeTerminalText("Passed\u001b[31m\r\nnow\u0000"),
        "Passed now"
    );

    assert.deepEqual(
        formatTerminalSection(
            "Result\n",
            [
                {
                    label: "Status\r",
                    value: "Passed\u001b[0m",
                },
            ]
        ),
        [
            "Result",
            "------",
            "Status: Passed",
        ]
    );
});
