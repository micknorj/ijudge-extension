import {
    getLoginAction,
    invalidateLoginAction,
} from "./actions";

import {
    assertAuthenticatedResponse,
    fetchIJudge,
    IJUDGE_ORIGIN,
    isActionNotFoundResponse,
    isRedirect,
    isSessionExpiredResponse,
    readTextLimited,
} from "./http";


const MAX_PAGE_BYTES =
    12 * 1024 * 1024;


export interface LoginResult {
    accessToken: string;
}


export async function loginToIJudge(
    username: string,
    password: string
): Promise<LoginResult> {
    for (
        let attempt = 0;
        attempt < 2;
        attempt++
    ) {
        const action =
            await getLoginAction();

        const response =
            await fetchIJudge(
                "/signin",
                {
                    method: "POST",

                    headers: {
                        Accept:
                            "text/x-component",

                        "Content-Type":
                            "text/plain;charset=UTF-8",

                        "Next-Action":
                            action,

                        Origin:
                            IJUDGE_ORIGIN,

                        Referer:
                            `${IJUDGE_ORIGIN}/signin`,
                    },

                    body:
                        JSON.stringify(
                            [
                                username,
                                password,
                                "$undefined",
                            ]
                        ),
                }
            );

        if (
            isActionNotFoundResponse(
                response
            )
        ) {
            invalidateLoginAction();

            if (
                attempt === 0
            ) {
                continue;
            }

            throw new Error(
                "The current iJudge login action could not be used."
            );
        }

        if (
            !response.ok &&
            response.status !== 303
        ) {
            throw new Error(
                `iJudge login failed with HTTP ${response.status}.`
            );
        }

        const cookie =
            response.headers.get(
                "set-cookie"
            );

        const match =
            cookie?.match(
                /(?:^|,\s*|;\s*)access_token=([^;,\s]+)/
            );

        if (!match) {
            throw new Error(
                "iJudge login did not return an access token."
            );
        }

        return {
            accessToken:
                match[1],
        };
    }

    throw new Error(
        "Could not complete iJudge login."
    );
}


export async function isSessionValid(
    accessToken: string
): Promise<boolean> {
    const response =
        await fetchIJudge(
            "/courses",
            {
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",
                },
            },
            accessToken
        );

    if (
        isSessionExpiredResponse(
            response
        )
    ) {
        return false;
    }

    if (
        isRedirect(
            response.status
        )
    ) {
        throw new Error(
            `Unexpected iJudge redirect: ${
                response.headers.get(
                    "location"
                ) ??
                "(missing location)"
            }`
        );
    }

    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ${response.status} while checking the session.`
        );
    }

    const source =
        await readTextLimited(
            response,
            MAX_PAGE_BYTES,
            "session page"
        );

    return (
        /<title[^>]*>\s*Courses\b/i.test(
            source
        ) ||
        /\\?"courseName\\?"\s*:/.test(
            source
        )
    );
}


export async function fetchAuthenticatedPage(
    path: string,
    accessToken: string
): Promise<string> {
    const response =
        await fetchIJudge(
            path,
            {
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",
                },
            },
            accessToken
        );

    assertAuthenticatedResponse(
        response
    );

    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ${response.status}.`
        );
    }

    return readTextLimited(
        response,
        MAX_PAGE_BYTES,
        "page"
    );
}
