import {
    assertAuthenticatedResponse,
    fetchIJudge,
    IJUDGE_ORIGIN,
    isRedirect,
    readTextLimited,
} from "./http";


const FALLBACK_LOGIN_ACTION =
    "7f71f9c659707739b0570d24aea95c12198cbf4c5c";

const FALLBACK_SUBMIT_ACTION =
    "7fc32d2dd54d0b8574db835d9b74354be0cac2fbd7";

const MAX_PAGE_BYTES =
    4 * 1024 * 1024;

const MAX_SCRIPT_BYTES =
    6 * 1024 * 1024;

const MAX_SCRIPTS =
    40;


type ActionKind =
    "login" |
    "submit";


interface ActionCandidate {
    id: string;
    score: number;
}


const actionCache:
    Partial<
        Record<
            ActionKind,
            string
        >
    > = {};


export async function getLoginAction():
    Promise<string> {
    if (
        actionCache.login
    ) {
        return actionCache.login;
    }

    actionCache.login =
        await discoverAction(
            "login",
            "/signin"
        ) ??
        FALLBACK_LOGIN_ACTION;

    return actionCache.login;
}


export async function getSubmitAction(
    problemId: number,
    accessToken: string
): Promise<string> {
    if (
        actionCache.submit
    ) {
        return actionCache.submit;
    }

    actionCache.submit =
        await discoverAction(
            "submit",
            `/problems/${problemId}/description?problemPage=0`,
            accessToken
        ) ??
        FALLBACK_SUBMIT_ACTION;

    return actionCache.submit;
}


export function invalidateLoginAction():
    void {
    actionCache.login =
        undefined;
}


export function invalidateSubmitAction():
    void {
    actionCache.submit =
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

    let best =
        getBestCandidate(
            candidates
        );

    if (
        best &&
        best.score >= 250
    ) {
        return best.id;
    }

    const scripts =
        extractScriptUrls(
            pageSource
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    scriptPriority(
                        a,
                        kind
                    ) -
                    scriptPriority(
                        b,
                        kind
                    )
            )
            .slice(
                0,
                MAX_SCRIPTS
            );

    for (
        const script
        of scripts
    ) {
        try {
            const source =
                await fetchScript(
                    script
                );

            mergeCandidates(
                candidates,
                findActionCandidates(
                    source,
                    kind,
                    script
                )
            );
        } catch {
            continue;
        }

        best =
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

    best =
        getBestCandidate(
            candidates
        );

    if (!best) {
        return undefined;
    }

    if (
        best.score >= 100 ||
        (
            candidates.size === 1 &&
            best.score >= 60
        )
    ) {
        return best.id;
    }

    return undefined;
}


async function fetchPageSource(
    pagePath: string,
    accessToken?: string
): Promise<string> {
    const response =
        await fetchIJudge(
            pagePath,
            {
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",
                },
            },
            accessToken
        );

    if (accessToken) {
        assertAuthenticatedResponse(
            response
        );
    } else if (
        isRedirect(
            response.status
        )
    ) {
        throw new Error(
            "Unexpected iJudge redirect."
        );
    }

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


async function fetchScript(
    scriptUrl: string
): Promise<string> {
    /*
     * Static frontend JavaScript does not need the
     * student's authentication cookie.
     */
    const response =
        await fetchIJudge(
            scriptUrl,
            {
                headers: {
                    Accept: "*/*",
                },
            }
        );

    if (
        isRedirect(
            response.status
        )
    ) {
        throw new Error(
            "Unexpected script redirect."
        );
    }

    if (!response.ok) {
        throw new Error(
            `Script returned HTTP ${response.status}.`
        );
    }

    return readTextLimited(
        response,
        MAX_SCRIPT_BYTES,
        "script"
    );
}


function extractScriptUrls(
    source: string
): string[] {
    const urls =
        new Set<string>();

    const patterns = [
        /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi,
        /(?:\/_next\/)?static\/chunks\/[^"'\\\s<>]+?\.js/g,
    ];

    for (
        const match
        of source.matchAll(
            patterns[0]
        )
    ) {
        const url =
            normalizeScriptUrl(
                match[1]
            );

        if (url) {
            urls.add(
                url
            );
        }
    }

    for (
        const match
        of source.matchAll(
            patterns[1]
        )
    ) {
        const url =
            normalizeScriptUrl(
                match[0]
            );

        if (url) {
            urls.add(
                url
            );
        }
    }

    return [
        ...urls,
    ];
}


function normalizeScriptUrl(
    rawValue: string
): string | undefined {
    let value =
        rawValue
            .replace(
                /&amp;|\\u0026/g,
                "&"
            )
            .trim();

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
                IJUDGE_ORIGIN
            );

        return (
            url.origin ===
            IJUDGE_ORIGIN
        )
            ? url.toString()
            : undefined;
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

    const idPattern =
        /["']([0-9a-f]{40})["']/gi;

    for (
        const match
        of source.matchAll(
            idPattern
        )
    ) {
        if (
            match.index ===
            undefined
        ) {
            continue;
        }

        const context =
            source.slice(
                Math.max(
                    0,
                    match.index - 700
                ),
                Math.min(
                    source.length,
                    match.index + 700
                )
            );

        if (
            !/createServerReference|registerServerReference|serverReference/i
                .test(
                    context
                )
        ) {
            continue;
        }

        candidates.push({
            id:
                match[1]
                    .toLowerCase(),

            score:
                60 +
                (
                    isPageSpecificSource(
                        sourceName,
                        kind
                    )
                        ? 40
                        : 0
                ) +
                semanticScore(
                    context,
                    kind
                ),
        });
    }

    return candidates;
}


function semanticScore(
    context: string,
    kind: ActionKind
): number {
    if (
        kind === "submit"
    ) {
        if (
            /submitCodeToServer/i.test(
                context
            )
        ) {
            return 200;
        }

        if (
            /submitCode/i.test(
                context
            )
        ) {
            return 120;
        }

        if (
            /\bsubmit\b|\bsubmission\b/i.test(
                context
            )
        ) {
            return 40;
        }

        return 0;
    }

    if (
        /loginToServer|signInToServer|signinToServer/i
            .test(
                context
            )
    ) {
        return 200;
    }

    if (
        /loginAction|signInAction|signinAction|authenticateAction/i
            .test(
                context
            )
    ) {
        return 160;
    }

    return (
        /\bauthenticate\b|\bsignin\b|\blogin\b/i
            .test(
                context
            )
    )
        ? 50
        : 0;
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
    return [
        ...candidates.values(),
    ].sort(
        (
            a,
            b
        ) =>
            b.score -
            a.score
    )[0];
}


function scriptPriority(
    sourceName: string,
    kind: ActionKind
): number {
    return isPageSpecificSource(
        sourceName,
        kind
    )
        ? 0
        : 1;
}


function isPageSpecificSource(
    sourceName: string,
    kind: ActionKind
): boolean {
    let source =
        sourceName;

    try {
        source =
            decodeURIComponent(
                sourceName
            );
    } catch {
        // Keep the original source name.
    }

    source =
        source.toLowerCase();

    return (
        kind === "login"
    )
        ? (
            source.includes(
                "signin"
            ) ||
            source.includes(
                "sign-in"
            )
        )
        : (
            source.includes(
                "problems"
            ) &&
            source.includes(
                "description"
            )
        );
}