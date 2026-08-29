import {
    getLoginAction,
    invalidateLoginAction,
} from "./actions";

import {
    SessionExpiredError,
} from "./errors";


const BASE_URL =
    "https://ijudge.it.kmitl.ac.th";

const REQUEST_TIMEOUT_MS =
    15_000;


export interface LoginResult {
    accessToken: string;
}


export async function loginToIJudge(
    username: string,
    password: string
): Promise<LoginResult> {
    const loginAction =
        await getLoginAction();

    const response =
        await fetchWithTimeout(
            `${BASE_URL}/signin`,
            {
                method:
                    "POST",

                redirect:
                    "manual",

                headers: {
                    Accept:
                        "text/x-component",

                    "Content-Type":
                        "text/plain;charset=UTF-8",

                    "Next-Action":
                        loginAction,

                    Origin:
                        BASE_URL,

                    Referer:
                        `${BASE_URL}/signin`,
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
        /*
         * Force rediscovery on the next login attempt
         * if the server action may have become invalid.
         *
         * Credentials are not automatically retried.
         */
        if (
            response.status === 404 ||
            response.status >= 500
        ) {
            invalidateLoginAction();
        }

        throw new Error(
            `iJudge login failed with HTTP ` +
            `${response.status}.`
        );
    }


    const setCookie =
        response.headers.get(
            "set-cookie"
        );


    if (!setCookie) {
        throw new Error(
            "iJudge did not return a login session."
        );
    }


    const match =
        setCookie.match(
            /(?:^|,\s*|;\s*)access_token=([^;,\s]+)/
        );


    if (!match) {
        throw new Error(
            "iJudge login succeeded, " +
            "but no access token was found."
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
        await fetchWithTimeout(
            `${BASE_URL}/courses`,
            {
                method:
                    "GET",

                redirect:
                    "manual",

                headers: {
                    Cookie:
                        `access_token=${accessToken}`,

                    Accept:
                        "text/html,application/xhtml+xml",
                },
            }
        );


    if (
        response.status === 401 ||
        response.status === 403
    ) {
        return false;
    }


    if (
        isRedirect(
            response.status
        )
    ) {
        const location =
            response.headers.get(
                "location"
            ) ?? "";


        if (
            location
                .toLowerCase()
                .includes(
                    "/signin"
                )
        ) {
            return false;
        }


        throw new Error(
            `Unexpected iJudge redirect: ` +
            `${location}`
        );
    }


    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ` +
            `${response.status} while checking the session.`
        );
    }


    return true;
}


export async function fetchRscPage(
    path: string,
    accessToken: string
): Promise<string> {
    const separator =
        path.includes("?")
            ? "&"
            : "?";


    const rscKey =
        createRscKey();


    const url =
        `${BASE_URL}${path}` +
        `${separator}_rsc=${rscKey}`;


    const response =
        await fetchWithTimeout(
            url,
            {
                method:
                    "GET",

                redirect:
                    "manual",

                headers: {
                    Cookie:
                        `access_token=${accessToken}`,

                    Accept:
                        "text/x-component",

                    RSC:
                        "1",

                    Referer:
                        `${BASE_URL}/courses`,
                },
            }
        );


    checkAuthenticatedResponse(
        response
    );


    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ` +
            `${response.status}.`
        );
    }


    return response.text();
}


function checkAuthenticatedResponse(
    response: Response
): void {
    if (
        response.status === 401 ||
        response.status === 403
    ) {
        throw new SessionExpiredError();
    }


    if (
        !isRedirect(
            response.status
        )
    ) {
        return;
    }


    const location =
        response.headers.get(
            "location"
        ) ?? "";


    if (
        location
            .toLowerCase()
            .includes(
                "/signin"
            )
    ) {
        throw new SessionExpiredError();
    }


    throw new Error(
        `Unexpected iJudge redirect: ` +
        `${location}`
    );
}


function createRscKey():
    string {
    const time =
        Date.now()
            .toString(
                36
            );

    const random =
        Math.random()
            .toString(
                36
            )
            .slice(
                2,
                8
            );

    return (
        `${time}${random}`
    );
}


async function fetchWithTimeout(
    url: string,
    options: RequestInit
): Promise<Response> {
    const controller =
        new AbortController();


    const timer =
        setTimeout(
            () => {
                controller.abort();
            },
            REQUEST_TIMEOUT_MS
        );


    try {
        return await fetch(
            url,
            {
                ...options,

                signal:
                    controller.signal,
            }
        );
    } catch (error) {
        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            throw new Error(
                "The iJudge request timed out."
            );
        }


        throw new Error(
            "Could not connect to iJudge."
        );
    } finally {
        clearTimeout(
            timer
        );
    }
}


function isRedirect(
    status: number
): boolean {
    return (
        status === 301 ||
        status === 302 ||
        status === 303 ||
        status === 307 ||
        status === 308
    );
}
