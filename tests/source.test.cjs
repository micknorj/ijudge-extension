const assert =
    require("node:assert/strict");

const {
    test,
} =
    require("node:test");

const {
    detectProblemId,
} =
    require("../out/source.js");


test(
    "detects triple-double-quote marker",
    () => {
        assert.equal(
            detectProblemId(
                '"""3155"""\nprint("hello")'
            ),
            3155
        );
    }
);


test(
    "detects triple-single-quote marker",
    () => {
        assert.equal(
            detectProblemId(
                "'''3155'''\nprint('hello')"
            ),
            3155
        );
    }
);


test(
    "detects numeric comment marker",
    () => {
        assert.equal(
            detectProblemId(
                "# 3155\nprint(1)"
            ),
            3155
        );
    }
);


test(
    "detects explicit ijudge marker",
    () => {
        assert.equal(
            detectProblemId(
                "# ijudge: 3155\nprint(1)"
            ),
            3155
        );
    }
);


test(
    "accepts UTF-8 BOM",
    () => {
        assert.equal(
            detectProblemId(
                '\uFEFF"""3155"""\nprint(1)'
            ),
            3155
        );
    }
);


test(
    "only first line may contain the marker",
    () => {
        assert.equal(
            detectProblemId(
                "print(1)\n# 3155"
            ),
            undefined
        );
    }
);


test(
    "rejects invalid problem IDs",
    () => {
        assert.equal(
            detectProblemId(
                "# 0"
            ),
            undefined
        );

        assert.equal(
            detectProblemId(
                "3155"
            ),
            undefined
        );

        assert.equal(
            detectProblemId(
                "# -3155"
            ),
            undefined
        );
    }
);