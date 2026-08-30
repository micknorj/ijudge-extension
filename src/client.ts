import {
    getLoginAction,
    invalidateLoginAction,
} from "./actions";

import {
    assertAuthenticatedResponse,
    fetchIJudge,
    ijUrl,
    isRedirect,
    isSessionExpiredResponse,
    readTextLimited,
} from "./http";


const MAX_RSC_BYTES =
    8 * 1024 * 1024;


export interface LoginResult {
    accessToken: string;
}


export async function loginToIJudge(
    username: string,
    password: string
): Promise<LoginResult> {
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
                        "https://ijudge.it.kmitl.ac.th",

                    Referer:
                        "https://ijudge.it.kmitl.ac.th/signin",
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
        response.status !== 303
    ) {
        if (
            response.status === 400 ||
            response.status === 404 ||
            response.status >= 500
        ) {
            invalidateLoginAction();
        }

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
            "iJudge login succeeded, but no access token was returned."
        );
    }

    return {
        accessToken:
            match[1],
    };
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

    return true;
}


export async function fetchRscPage(
    path: string,
    accessToken: string
): Promise<string> {
    const pageUrl =
        ijUrl(
            path
        );

    const requestUrl =
        new URL(
            pageUrl
        );

    requestUrl.searchParams.set(
        "_rsc",
        createRscKey()
    );

    const response =
        await fetchIJudge(
            requestUrl.toString(),
            {
                headers: {
                    Accept:
                        "text/x-component",

                    RSC:
                        "1",

                    Referer:
                        pageUrl,
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
        MAX_RSC_BYTES,
        "RSC response"
    );
}


function createRscKey():
    string {
    return (
        Date.now()
            .toString(
                36
            ) +
        Math.random()
            .toString(
                36
            )
            .slice(
                2,
                8
            )
    );
}