import {
    SessionExpiredError,
} from "./errors";


export const IJUDGE_ORIGIN =
    "https://ijudge.it.kmitl.ac.th";


const DEFAULT_TIMEOUT_MS =
    15_000;


export function ijUrl(
    pathOrUrl: string
): string {
    const url =
        new URL(
            pathOrUrl,
            IJUDGE_ORIGIN
        );

    if (
        url.origin !==
        IJUDGE_ORIGIN
    ) {
        throw new Error(
            "Refusing request outside the iJudge origin."
        );
    }

    return url.toString();
}


export async function fetchIJudge(
    pathOrUrl: string,
    options: RequestInit = {},
    accessToken?: string,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
    const url =
        ijUrl(
            pathOrUrl
        );

    const headers =
        new Headers(
            options.headers
        );

    /*
     * Authentication cookies are managed only here.
     * Callers cannot inject their own Cookie header.
     */
    if (
        headers.has(
            "Cookie"
        )
    ) {
        throw new Error(
            "Cookie headers must be managed internally."
        );
    }

    if (accessToken) {
        headers.set(
            "Cookie",
            `access_token=${accessToken}`
        );
    }

    const controller =
        new AbortController();

    const timer =
        setTimeout(
            () =>
                controller.abort(),
            timeoutMs
        );

    try {
        return await fetch(
            url,
            {
                ...options,
                headers,
                redirect: "manual",
                signal: controller.signal,
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


export function isRedirect(
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


export function isSessionExpiredResponse(
    response: Response
): boolean {
    if (
        response.status === 401 ||
        response.status === 403
    ) {
        return true;
    }

    if (
        !isRedirect(
            response.status
        )
    ) {
        return false;
    }

    const location =
        response.headers.get(
            "location"
        );

    if (!location) {
        return false;
    }

    try {
        const url =
            new URL(
                location,
                response.url ||
                    IJUDGE_ORIGIN
            );

        return (
            url.origin ===
                IJUDGE_ORIGIN &&
            url.pathname
                .toLowerCase()
                .startsWith(
                    "/signin"
                )
        );
    } catch {
        return false;
    }
}


export function assertAuthenticatedResponse(
    response: Response
): void {
    if (
        isSessionExpiredResponse(
            response
        )
    ) {
        throw new SessionExpiredError();
    }

    if (
        isRedirect(
            response.status
        )
    ) {
        const location =
            response.headers.get(
                "location"
            ) ?? "(missing location)";

        throw new Error(
            `Unexpected iJudge redirect: ${location}`
        );
    }
}


export async function readTextLimited(
    response: Response,
    maxBytes: number,
    label = "response"
): Promise<string> {
    const contentLength =
        Number(
            response.headers.get(
                "content-length"
            )
        );

    if (
        Number.isFinite(
            contentLength
        ) &&
        contentLength > maxBytes
    ) {
        throw new Error(
            `The iJudge ${label} exceeded the safe size limit.`
        );
    }

    if (!response.body) {
        return "";
    }

    const reader =
        response.body.getReader();

    const decoder =
        new TextDecoder();

    let total =
        0;

    let text =
        "";

    while (true) {
        const {
            done,
            value,
        } =
            await reader.read();

        if (done) {
            break;
        }

        total +=
            value.byteLength;

        if (
            total >
            maxBytes
        ) {
            await reader.cancel();

            throw new Error(
                `The iJudge ${label} exceeded the safe size limit.`
            );
        }

        text +=
            decoder.decode(
                value,
                {
                    stream: true,
                }
            );
    }

    text +=
        decoder.decode();

    return text;
}