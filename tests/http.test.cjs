const assert =
    require("node:assert/strict");

const {
    afterEach,
    test,
} =
    require("node:test");

const {
    fetchIJudge,
    ijUrl,
    readTextLimited,
} =
    require("../out/http.js");


const originalFetch =
    global.fetch;


afterEach(
    () => {
        global.fetch =
            originalFetch;
    }
);


test(
    "ijUrl accepts official iJudge paths",
    () => {
        assert.equal(
            ijUrl(
                "/courses"
            ),
            "https://ijudge.it.kmitl.ac.th/courses"
        );
    }
);


test(
    "ijUrl refuses external origins",
    () => {
        assert.throws(
            () =>
                ijUrl(
                    "https://example.com/steal"
                ),
            /outside the iJudge origin/
        );
    }
);


test(
    "fetchIJudge never sends a token to an external origin",
    async () => {
        let called =
            false;

        global.fetch =
            async () => {
                called =
                    true;

                return new Response(
                    "unexpected"
                );
            };

        await assert.rejects(
            fetchIJudge(
                "https://example.com/",
                {},
                "fake-secret-token"
            ),
            /outside the iJudge origin/
        );

        assert.equal(
            called,
            false
        );
    }
);


test(
    "fetchIJudge attaches the session only internally",
    async () => {
        let request;

        global.fetch =
            async (
                url,
                options
            ) => {
                request = {
                    url,
                    options,
                };

                return new Response(
                    "ok",
                    {
                        status: 200,
                    }
                );
            };

        await fetchIJudge(
            "/courses",
            {
                headers: {
                    Accept:
                        "text/html",
                },
            },
            "fake-token"
        );

        assert.equal(
            request.url,
            "https://ijudge.it.kmitl.ac.th/courses"
        );

        const headers =
            new Headers(
                request.options.headers
            );

        assert.equal(
            headers.get(
                "cookie"
            ),
            "access_token=fake-token"
        );

        assert.equal(
            request.options.redirect,
            "manual"
        );
    }
);


test(
    "callers cannot inject Cookie headers",
    async () => {
        await assert.rejects(
            fetchIJudge(
                "/courses",
                {
                    headers: {
                        Cookie:
                            "evil=value",
                    },
                }
            ),
            /managed internally/
        );
    }
);


test(
    "readTextLimited rejects oversized responses",
    async () => {
        const response =
            new Response(
                "1234567890"
            );

        await assert.rejects(
            readTextLimited(
                response,
                5,
                "test response"
            ),
            /safe size limit/
        );
    }
);