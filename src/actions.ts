const BASE_URL =
    "https://ijudge.it.kmitl.ac.th";

const REQUEST_TIMEOUT_MS =
    15_000;


/*
 * Compatibility fallbacks.
 *
 * iJudge currently uses Next.js Server Actions.
 * The extension attempts to discover the current
 * action IDs automatically from the live frontend.
 *
 * These known-good values are retained temporarily
 * as fallbacks in case discovery cannot identify
 * the current action.
 */
const FALLBACK_LOGIN_ACTION =
    "7f71f9c659707739b0570d24aea95c12198cbf4c5c";

const FALLBACK_SUBMIT_ACTION =
    "7fc32d2dd54d0b8574db835d9b74354be0cac2fbd7";


type ActionKind =
    "login" |
    "submit";


interface ActionCandidate {
    id: string;
    score: number;
}


let cachedLoginAction:
    string | undefined;

let cachedSubmitAction:
    string | undefined;


export async function getLoginAction():
    Promise<string> {
    if (cachedLoginAction) {
        return cachedLoginAction;
    }

    const discovered =
        await discoverAction(
            "login",
            "/signin"
        );

    cachedLoginAction =
        discovered ??
        FALLBACK_LOGIN_ACTION;

    return cachedLoginAction;
}


export async function getSubmitAction(
    problemId: number,
    accessToken: string
): Promise<string> {
    if (cachedSubmitAction) {
        return cachedSubmitAction;
    }

    const discovered =
        await discoverAction(
            "submit",
            `/problems/${problemId}/description?problemPage=0`,
            accessToken
        );

    cachedSubmitAction =
        discovered ??
        FALLBACK_SUBMIT_ACTION;

    return cachedSubmitAction;
}


export function invalidateLoginAction():
    void {
    cachedLoginAction =
        undefined;
}


export function invalidateSubmitAction():
    void {
    cachedSubmitAction =
        undefined;
}


async function discoverAction(
    kind: ActionKind,
    pagePath: string,
    accessToken?: string
): Promise<string | undefined> {
    let pageSource:
        string;

    try {
        pageSource =
            await fetchPageSource(
                pagePath,
                accessToken
            );
    } catch {
        return undefined;
    }

    const candidates =
        new Map<
            string,
            ActionCandidate
        >();

    mergeCandidates(
        candidates,
        findActionCandidates(
            pageSource,
            kind,
            pagePath
        )
    );

    const scriptUrls =
        extractScriptUrls(
            pageSource
        );

    scriptUrls.sort(
        (a, b) =>
            scriptPriority(
                a,
                kind
            )
            -
            scriptPriority(
                b,
                kind
            )
    );

    const scriptsToInspect =
        scriptUrls.slice(
            0,
            60
        );

    for (
        const scriptUrl
        of scriptsToInspect
    ) {
        let source:
            string;

        try {
            source =
                await fetchScript(
                    scriptUrl,
                    accessToken
                );
        } catch {
            continue;
        }

        mergeCandidates(
            candidates,
            findActionCandidates(
                source,
                kind,
                scriptUrl
            )
        );

        const best =
            getBestCandidate(
                candidates
            );

        if (
            best &&
            best.score >= 250
        ) {
            return best.id;
        }
    }

    const best =
        getBestCandidate(
            candidates
        );

    if (!best) {
        return undefined;
    }

    if (
        best.score >= 100
    ) {
        return best.id;
    }

    if (
        candidates.size === 1 &&
        best.score >= 60
    ) {
        return best.id;
    }

    return undefined;
}


async function fetchPageSource(
    pagePath: string,
    accessToken?: string
): Promise<string> {
    const url =
        new URL(
            pagePath,
            BASE_URL
        );

    const headers:
        Record<string, string> = {
            Accept:
                "text/html,application/xhtml+xml",
        };

    if (accessToken) {
        headers.Cookie =
            `access_token=${accessToken}`;
    }

    const response =
        await fetchWithTimeout(
            url.toString(),
            {
                method:
                    "GET",

                redirect:
                    "manual",

                headers,
            }
        );

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
            throw new Error(
                "Authentication required."
            );
        }

        throw new Error(
            `Unexpected redirect: ${location}`
        );
    }

    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ${response.status}.`
        );
    }

    return response.text();
}


async function fetchScript(
    scriptUrl: string,
    accessToken?: string
): Promise<string> {
    const url =
        new URL(
            scriptUrl
        );

    /*
     * The iJudge access token must never be sent
     * to another origin.
     */
    if (
        url.origin !==
        BASE_URL
    ) {
        throw new Error(
            "External script origin refused."
        );
    }

    const headers:
        Record<string, string> = {
            Accept:
                "*/*",
        };

    if (accessToken) {
        headers.Cookie =
            `access_token=${accessToken}`;
    }

    const response =
        await fetchWithTimeout(
            url.toString(),
            {
                method:
                    "GET",

                redirect:
                    "manual",

                headers,
            }
        );

    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ${response.status}.`
        );
    }

    return response.text();
}


function extractScriptUrls(
    source: string
): string[] {
    const urls =
        new Set<string>();

    /*
     * Standard HTML script references.
     */
    const scriptTagPattern =
        /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;

    for (
        const match
        of source.matchAll(
            scriptTagPattern
        )
    ) {
        const normalized =
            normalizeScriptUrl(
                match[1]
            );

        if (normalized) {
            urls.add(
                normalized
            );
        }
    }

    /*
     * Next.js serialized chunk references.
     */
    const chunkPattern =
        /(?:\/_next\/)?static\/chunks\/[^"'\\\s<>]+?\.js/g;

    for (
        const match
        of source.matchAll(
            chunkPattern
        )
    ) {
        const normalized =
            normalizeScriptUrl(
                match[0]
            );

        if (normalized) {
            urls.add(
                normalized
            );
        }
    }

    return Array.from(
        urls
    );
}


function normalizeScriptUrl(
    rawValue: string
): string | undefined {
    let value =
        rawValue
            .replace(
                /&amp;/g,
                "&"
            )
            .replace(
                /\\u0026/g,
                "&"
            )
            .trim();

    if (!value) {
        return undefined;
    }

    if (
        value.startsWith(
            "static/"
        )
    ) {
        value =
            `/_next/${value}`;
    } else if (
        value.startsWith(
            "/static/"
        )
    ) {
        value =
            `/_next${value}`;
    } else if (
        value.startsWith(
            "_next/"
        )
    ) {
        value =
            `/${value}`;
    }

    try {
        const url =
            new URL(
                value,
                BASE_URL
            );

        if (
            url.origin !==
            BASE_URL
        ) {
            return undefined;
        }

        return url.toString();
    } catch {
        return undefined;
    }
}


function findActionCandidates(
    source: string,
    kind: ActionKind,
    sourceName: string
): ActionCandidate[] {
    const candidates:
        ActionCandidate[] = [];

    /*
     * Current Next.js Server Action IDs used by
     * iJudge are 40 hexadecimal characters.
     */
    const idPattern =
        /["']([0-9a-f]{40})["']/gi;

    for (
        const match
        of source.matchAll(
            idPattern
        )
    ) {
        if (
            match.index === undefined
        ) {
            continue;
        }

        const start =
            Math.max(
                0,
                match.index - 700
            );

        const end =
            Math.min(
                source.length,
                match.index + 700
            );

        const context =
            source.slice(
                start,
                end
            );

        /*
         * Ignore arbitrary SHA-like values unless they
         * appear near Next.js Server Action machinery.
         */
        if (
            !/createServerReference|registerServerReference|serverReference/i
                .test(
                    context
                )
        ) {
            continue;
        }

        let score =
            60;

        if (
            isPageSpecificSource(
                sourceName,
                kind
            )
        ) {
            score +=
                40;
        }

        if (
            kind === "submit"
        ) {
            if (
                /submitCodeToServer/i
                    .test(
                        context
                    )
            ) {
                score +=
                    200;
            } else if (
                /submitCode/i
                    .test(
                        context
                    )
            ) {
                score +=
                    120;
            } else if (
                /\bsubmit\b|\bsubmission\b/i
                    .test(
                        context
                    )
            ) {
                score +=
                    40;
            }
        } else {
            if (
                /loginToServer|signInToServer|signinToServer/i
                    .test(
                        context
                    )
            ) {
                score +=
                    200;
            } else if (
                /loginAction|signInAction|signinAction|authenticateAction/i
                    .test(
                        context
                    )
            ) {
                score +=
                    160;
            } else if (
                /\bauthenticate\b|\bsignin\b|\bsignIn\b|\blogin\b/i
                    .test(
                        context
                    )
            ) {
                score +=
                    50;
            }
        }

        candidates.push({
            id:
                match[1]
                    .toLowerCase(),

            score,
        });
    }

    return candidates;
}


function mergeCandidates(
    destination:
        Map<
            string,
            ActionCandidate
        >,
    candidates:
        ActionCandidate[]
): void {
    for (
        const candidate
        of candidates
    ) {
        const existing =
            destination.get(
                candidate.id
            );

        if (
            !existing ||
            candidate.score >
            existing.score
        ) {
            destination.set(
                candidate.id,
                candidate
            );
        }
    }
}


function getBestCandidate(
    candidates:
        Map<
            string,
            ActionCandidate
        >
): ActionCandidate | undefined {
    let best:
        ActionCandidate | undefined;

    for (
        const candidate
        of candidates.values()
    ) {
        if (
            !best ||
            candidate.score >
            best.score
        ) {
            best =
                candidate;
        }
    }

    return best;
}


function scriptPriority(
    url: string,
    kind: ActionKind
): number {
    return isPageSpecificSource(
        url,
        kind
    )
        ? 0
        : 1;
}


function isPageSpecificSource(
    sourceName: string,
    kind: ActionKind
): boolean {
    let decoded =
        sourceName;

    try {
        decoded =
            decodeURIComponent(
                sourceName
            );
    } catch {
        /*
         * Keep original source name.
         */
    }

    const lower =
        decoded.toLowerCase();

    if (
        kind === "login"
    ) {
        return (
            lower.includes(
                "signin"
            ) ||
            lower.includes(
                "sign-in"
            )
        );
    }

    return (
        lower.includes(
            "problems"
        ) &&
        lower.includes(
            "description"
        )
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
