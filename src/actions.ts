import {
    IJudgeCompatibilityError,
} from "./errors";

import {
    assertAuthenticatedResponse,
    fetchIJudge,
    IJUDGE_ORIGIN,
    isRedirect,
    readTextLimited,
} from "./http";


const MAX_PAGE_BYTES =
    4 * 1024 * 1024;

const MAX_SCRIPT_BYTES =
    6 * 1024 * 1024;

const MAX_SCRIPTS =
    50;

const MAX_ACTION_ID_LENGTH =
    512;


type ActionKind =
    | "login"
    | "submit";


export interface ServerActionReference {
    id: string;
    name: string;
}


const ACTION_NAMES:
    Record<ActionKind, string> = {
        login:
            "signIn",

        submit:
            "submitCodeToServer",
    };


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
        );

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
        );

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


export function clearActionCache():
    void {
    actionCache.login =
        undefined;

    actionCache.submit =
        undefined;
}


export function findServerActionId(
    source: string,
    expectedName: string
): string | undefined {
    return findServerActionIdAcrossSources(
        [
            source,
        ],
        expectedName
    );
}


export function findServerActionIdAcrossSources(
    sources: readonly string[],
    expectedName: string
): string | undefined {
    const ids =
        new Set<string>();

    for (
        const source
        of sources
    ) {
        const references =
            parseServerActionReferences(
                source
            );

        for (
            const reference
            of references
        ) {
            if (
                reference.name !==
                expectedName
            ) {
                continue;
            }

            ids.add(
                reference.id
            );
        }
    }

    if (
        ids.size === 0
    ) {
        return undefined;
    }

    if (
        ids.size > 1
    ) {
        throw new IJudgeCompatibilityError(
            "ACTION_AMBIGUOUS",
            [
                "Conflicting iJudge Server Actions were found",
                "for the required frontend action.",
                "The extension stopped instead of guessing.",
            ].join(" ")
        );
    }

    for (
        const id
        of ids
    ) {
        return id;
    }

    return undefined;
}


export function parseServerActionReferences(
    source: string
): ServerActionReference[] {
    const references:
        ServerActionReference[] = [];

    const seen =
        new Set<string>();

    const marker =
        "createServerReference";

    let searchFrom =
        0;

    while (true) {
        const markerIndex =
            source.indexOf(
                marker,
                searchFrom
            );

        if (
            markerIndex < 0
        ) {
            break;
        }

        const openIndex =
            findInvocationOpen(
                source,
                markerIndex +
                    marker.length
            );

        if (
            openIndex < 0
        ) {
            searchFrom =
                markerIndex +
                marker.length;

            continue;
        }

        const call =
            readCall(
                source,
                openIndex
            );

        if (!call) {
            searchFrom =
                openIndex + 1;

            continue;
        }

        const args =
            splitTopLevelArguments(
                call.body
            );

        if (
            args.length >= 5
        ) {
            const id =
                parseStringLiteral(
                    args[0]
                );

            const name =
                parseStringLiteral(
                    args[4]
                );

            if (
                id &&
                name &&
                isUsableActionId(
                    id
                )
            ) {
                const key =
                    `${name}\u0000${id}`;

                if (
                    !seen.has(
                        key
                    )
                ) {
                    seen.add(
                        key
                    );

                    references.push({
                        id,
                        name,
                    });
                }
            }
        }

        searchFrom =
            call.endIndex + 1;
    }

    return references;
}


async function discoverAction(
    kind: ActionKind,
    pagePath: string,
    accessToken?: string
): Promise<string> {
    const expectedName =
        ACTION_NAMES[kind];

    const pageSource =
        await fetchPageSource(
            pagePath,
            accessToken
        );

    const allScripts =
        extractScriptUrls(
            pageSource
        ).sort(
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
        );

    if (
        allScripts.length >
        MAX_SCRIPTS
    ) {
        throw new IJudgeCompatibilityError(
            "ACTION_SCAN_INCOMPLETE",
            [
                "The current iJudge frontend references more scripts",
                "than the extension can inspect safely.",
                "The extension stopped instead of guessing.",
            ].join(" ")
        );
    }

    const sources:
        string[] = [
            pageSource,
        ];

    let scanIncomplete =
        false;

    for (
        const script
        of allScripts
    ) {
        try {
            sources.push(
                await fetchScript(
                    script
                )
            );
        } catch {
            scanIncomplete =
                true;
        }
    }

    /*
     * A failed script request means there is a source that
     * could contain another reference for the same semantic
     * action. Returning an already-found action in this state
     * would restore first-match/partial-scan behavior.
     */
    if (
        scanIncomplete
    ) {
        throw new IJudgeCompatibilityError(
            "ACTION_SCAN_INCOMPLETE",
            [
                "The current iJudge frontend could not be inspected",
                "completely, so the required action could not be",
                "selected safely.",
            ].join(" ")
        );
    }

    let action:
        string | undefined;

    try {
        action =
            findServerActionIdAcrossSources(
                sources,
                expectedName
            );
    } catch (error) {
        if (
            error instanceof
            IJudgeCompatibilityError &&
            error.code ===
                "ACTION_AMBIGUOUS"
        ) {
            const label =
                kind === "login"
                    ? "login"
                    : "submission";

            throw new IJudgeCompatibilityError(
                "ACTION_AMBIGUOUS",
                [
                    `Conflicting iJudge ${label} actions were found`,
                    "in the current frontend.",
                    "The extension stopped instead of guessing.",
                ].join(" ")
            );
        }

        throw error;
    }

    if (action) {
        return action;
    }

    const label =
        kind === "login"
            ? "login"
            : "submission";

    throw new IJudgeCompatibilityError(
        "ACTION_NOT_FOUND",
        [
            `The required iJudge ${label} action could not be found.`,
            "The iJudge frontend may have changed.",
        ].join(" ")
    );
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
     * Deliberately no access token is supplied here.
     * Static frontend assets must never receive the
     * authenticated iJudge session cookie.
     */
    const response =
        await fetchIJudge(
            scriptUrl,
            {
                headers: {
                    Accept:
                        "*/*",
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

    const tagPattern =
        /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;

    const chunkPattern =
        /(?:\/_next\/)?static\/chunks\/[^"'\\\s<>]+?\.js/g;

    for (
        const match
        of source.matchAll(
            tagPattern
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
            chunkPattern
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


function scriptPriority(
    sourceName: string,
    kind: ActionKind
): number {
    let source =
        sourceName;

    try {
        source =
            decodeURIComponent(
                sourceName
            );
    } catch {
        /*
         * Keep the encoded URL.
         */
    }

    source =
        source.toLowerCase();

    if (
        kind === "login" &&
        source.includes(
            "signin"
        )
    ) {
        return 0;
    }

    if (
        kind === "submit" &&
        source.includes(
            "problems"
        ) &&
        source.includes(
            "description"
        )
    ) {
        return 0;
    }

    return 1;
}


function findInvocationOpen(
    source: string,
    fromIndex: number
): number {
    let index =
        fromIndex;

    while (
        index <
            source.length &&
        /\s/.test(
            source[index]
        )
    ) {
        index++;
    }

    /*
     * Supports the common minified form:
     *
     * (0,x.createServerReference)(...)
     */
    while (
        source[index] ===
        ")"
    ) {
        index++;

        while (
            index <
                source.length &&
            /\s/.test(
                source[index]
            )
        ) {
            index++;
        }
    }

    return (
        source[index] ===
        "("
    )
        ? index
        : -1;
}


function readCall(
    source: string,
    openIndex: number
): {
    body: string;
    endIndex: number;
} | undefined {
    let depth =
        1;

    let quote:
        string | undefined;

    let escaped =
        false;

    for (
        let index =
            openIndex + 1;
        index <
            source.length;
        index++
    ) {
        const character =
            source[index];

        if (quote) {
            if (escaped) {
                escaped =
                    false;

                continue;
            }

            if (
                character ===
                "\\"
            ) {
                escaped =
                    true;

                continue;
            }

            if (
                character ===
                quote
            ) {
                quote =
                    undefined;
            }

            continue;
        }

        if (
            character ===
                '"' ||
            character ===
                "'" ||
            character ===
                "`"
        ) {
            quote =
                character;

            continue;
        }

        if (
            character ===
            "("
        ) {
            depth++;

            continue;
        }

        if (
            character !==
            ")"
        ) {
            continue;
        }

        depth--;

        if (
            depth === 0
        ) {
            return {
                body:
                    source.slice(
                        openIndex + 1,
                        index
                    ),

                endIndex:
                    index,
            };
        }
    }

    return undefined;
}


function splitTopLevelArguments(
    source: string
): string[] {
    const args:
        string[] = [];

    let start =
        0;

    let round =
        0;

    let square =
        0;

    let curly =
        0;

    let quote:
        string | undefined;

    let escaped =
        false;

    for (
        let index = 0;
        index <
            source.length;
        index++
    ) {
        const character =
            source[index];

        if (quote) {
            if (escaped) {
                escaped =
                    false;

                continue;
            }

            if (
                character ===
                "\\"
            ) {
                escaped =
                    true;

                continue;
            }

            if (
                character ===
                quote
            ) {
                quote =
                    undefined;
            }

            continue;
        }

        if (
            character ===
                '"' ||
            character ===
                "'" ||
            character ===
                "`"
        ) {
            quote =
                character;

            continue;
        }

        switch (character) {
            case "(":
                round++;
                break;

            case ")":
                round--;
                break;

            case "[":
                square++;
                break;

            case "]":
                square--;
                break;

            case "{":
                curly++;
                break;

            case "}":
                curly--;
                break;

            case ",":
                if (
                    round === 0 &&
                    square === 0 &&
                    curly === 0
                ) {
                    args.push(
                        source.slice(
                            start,
                            index
                        ).trim()
                    );

                    start =
                        index + 1;
                }

                break;
        }
    }

    args.push(
        source.slice(
            start
        ).trim()
    );

    return args;
}


function parseStringLiteral(
    source: string
): string | undefined {
    const value =
        source.trim();

    if (
        value.length < 2
    ) {
        return undefined;
    }

    const quote =
        value[0];

    if (
        (
            quote !== '"' &&
            quote !== "'"
        ) ||
        value[
            value.length - 1
        ] !== quote
    ) {
        return undefined;
    }

    let result =
        "";

    for (
        let index = 1;
        index <
            value.length - 1;
        index++
    ) {
        const character =
            value[index];

        if (
            character !==
            "\\"
        ) {
            result +=
                character;

            continue;
        }

        index++;

        if (
            index >=
            value.length - 1
        ) {
            return undefined;
        }

        const escaped =
            value[index];

        switch (escaped) {
            case "n":
                result +=
                    "\n";
                break;

            case "r":
                result +=
                    "\r";
                break;

            case "t":
                result +=
                    "\t";
                break;

            case "b":
                result +=
                    "\b";
                break;

            case "f":
                result +=
                    "\f";
                break;

            case "v":
                result +=
                    "\v";
                break;

            case "x": {
                const hex =
                    value.slice(
                        index + 1,
                        index + 3
                    );

                if (
                    !/^[0-9a-f]{2}$/i
                        .test(
                            hex
                        )
                ) {
                    return undefined;
                }

                result +=
                    String.fromCharCode(
                        Number.parseInt(
                            hex,
                            16
                        )
                    );

                index += 2;

                break;
            }

            case "u": {
                const hex =
                    value.slice(
                        index + 1,
                        index + 5
                    );

                if (
                    !/^[0-9a-f]{4}$/i
                        .test(
                            hex
                        )
                ) {
                    return undefined;
                }

                result +=
                    String.fromCharCode(
                        Number.parseInt(
                            hex,
                            16
                        )
                    );

                index += 4;

                break;
            }

            default:
                result +=
                    escaped;

                break;
        }
    }

    return result;
}


function isUsableActionId(
    value: string
): boolean {
    return (
        value.length > 0 &&
        value.length <=
            MAX_ACTION_ID_LENGTH &&
        value.trim() ===
            value &&
        !/[\u0000-\u001f\u007f]/
            .test(
                value
            )
    );
}
