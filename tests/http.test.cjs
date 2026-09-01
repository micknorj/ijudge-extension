const test = require("node:test");
const assert = require("node:assert/strict");

const {
    fetchIJudge,
    ijUrl,
    isActionNotFoundResponse,
    isSessionExpiredResponse,
    readTextLimited,
} = require("../out/http.js");


test(
    "ijUrl accepts official iJudge paths",
    () => {
        assert.equal(
            ijUrl("/courses"),
            "https://ijudge.it.kmitl.ac.th/courses"
        );
    }
);


test(
    "ijUrl refuses external origins",
    () => {
        assert.throws(
            () => ijUrl("https://example.com/"),
            /outside the iJudge origin/
        );
    }
);


test(
    "fetchIJudge never sends a token to an external origin",
    async () => {
        await assert.rejects(
            fetchIJudge("https://example.com/", {}, "secret"),
            /outside the iJudge origin/
        );
    }
);


test(
    "fetchIJudge attaches the session only internally",
    async () => {
        const originalFetch = global.fetch;
        let cookie;

        global.fetch = async (_url, init) => {
            cookie = new Headers(init.headers).get("Cookie");
            return new Response("ok", { status: 200 });
        };

        try {
            await fetchIJudge("/courses", {}, "secret-token");
        } finally {
            global.fetch = originalFetch;
        }

        assert.equal(cookie, "access_token=secret-token");
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
                        Cookie: "bad=value",
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
        const response = new Response(
            "123456",
            {
                headers: {
                    "content-length": "6",
                },
            }
        );

        await assert.rejects(
            readTextLimited(response, 5, "test response"),
            /safe size limit/
        );
    }
);


test(
    "401 is treated as session expiration",
    () => {
        assert.equal(
            isSessionExpiredResponse(new Response("", { status: 401 })),
            true
        );
    }
);


test(
    "403 is not automatically treated as session expiration",
    () => {
        assert.equal(
            isSessionExpiredResponse(new Response("", { status: 403 })),
            false
        );
    }
);


test(
    "redirect to signin is treated as session expiration",
    () => {
        const response = new Response(
            "",
            {
                status: 302,
                headers: {
                    location: "/signin",
                },
            }
        );

        assert.equal(isSessionExpiredResponse(response), true);
    }
);


test(
    "detects explicit Next.js action-not-found response",
    () => {
        const response = new Response(
            "",
            {
                status: 404,
                headers: {
                    "x-nextjs-action-not-found": "1",
                },
            }
        );

        assert.equal(isActionNotFoundResponse(response), true);
    }
);


test(
    "generic 404 is not treated as an explicit stale Server Action",
    () => {
        const response = new Response("", { status: 404 });
        assert.equal(isActionNotFoundResponse(response), false);
    }
);
