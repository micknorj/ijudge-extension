import {
    getSubmitAction,
    invalidateSubmitAction,
} from "./actions";

import {
    SessionExpiredError,
} from "./errors";


const BASE_URL =
    "https://ijudge.it.kmitl.ac.th";

const REQUEST_TIMEOUT_MS =
    30_000;

const POLL_INTERVAL_MS =
    1_000;

const DEFAULT_POLL_TIMEOUT_MS =
    120_000;

const MAX_CONSECUTIVE_POLL_FAILURES =
    5;


export interface SubmitSourceOptions {
    problemId: number;
    courseId: number;
    language: string;
    code: string;
    accessToken: string;
}


export interface TestcaseResult {
    testcaseId: number;
    result: string;
    execution: number | undefined;
}


export interface SubmissionResult {
    submissionId: number;
    result: string;
    score: number;
    createdAt: string;
    qualityScore: number | undefined;
    records: TestcaseResult[];
}


export async function submitSource(
    options: SubmitSourceOptions
): Promise<number> {
    const {
        problemId,
        courseId,
        language,
        code,
        accessToken,
    } = options;


    const submitAction =
        await getSubmitAction(
            problemId,
            accessToken
        );


    const url =
        `${BASE_URL}/problems/` +
        `${problemId}/description?problemPage=0`;


    const payload = [
        {
            code,

            lang_type:
                language,

            course_problem_id:
                problemId,

            course_id:
                courseId,
        },
    ];


    const response =
        await fetchWithTimeout(
            url,
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
                        submitAction,

                    Origin:
                        BASE_URL,

                    Referer:
                        url,

                    Cookie:
                        `access_token=${accessToken}`,
                },

                body:
                    JSON.stringify(
                        payload
                    ),
            }
        );


    checkSessionResponse(
        response
    );


    if (
        response.status !== 200
    ) {
        /*
         * Invalidate the action so the NEXT submission
         * performs discovery again.
         *
         * Never automatically repeat an ambiguous POST.
         */
        if (
            response.status === 400 ||
            response.status === 404 ||
            response.status >= 500
        ) {
            invalidateSubmitAction();
        }


        throw new Error(
            `iJudge returned HTTP ` +
            `${response.status} while submitting.`
        );
    }


    const responseText =
        await response.text();


    const success =
        responseSaysSuccess(
            responseText
        );


    const submissionId =
        getSubmissionId(
            responseText
        );


    if (
        !success ||
        submissionId === undefined
    ) {
        invalidateSubmitAction();


        throw new Error(
            "iJudge did not confirm the submission. " +
            "The submission interface may have changed."
        );
    }


    return submissionId;
}


export async function fetchSubmissionResult(
    submissionId: number,
    accessToken: string
): Promise<SubmissionResult | undefined> {
    const url =
        `${BASE_URL}/submissions/` +
        `${submissionId}/overview`;


    const response =
        await fetchWithTimeout(
            url,
            {
                method:
                    "GET",

                redirect:
                    "manual",

                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",

                    Cookie:
                        `access_token=${accessToken}`,
                },
            }
        );


    checkSessionResponse(
        response
    );


    /*
     * A newly-created submission may briefly be
     * unavailable while the backend initializes it.
     */
    if (
        response.status === 404
    ) {
        return undefined;
    }


    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ` +
            `${response.status} while checking the result.`
        );
    }


    const responseText =
        await response.text();


    return parseSubmissionResult(
        submissionId,
        responseText
    );
}


export async function waitForSubmission(
    submissionId: number,
    accessToken: string,
    onWaiting?: () => void,
    timeoutMs =
        DEFAULT_POLL_TIMEOUT_MS
): Promise<SubmissionResult | undefined> {
    const started =
        Date.now();


    let consecutiveFailures =
        0;


    let lastFailure:
        unknown;


    while (
        Date.now() - started <
        timeoutMs
    ) {
        try {
            const result =
                await fetchSubmissionResult(
                    submissionId,
                    accessToken
                );


            consecutiveFailures =
                0;

            lastFailure =
                undefined;


            if (result) {
                return result;
            }
        } catch (error) {
            if (
                error instanceof
                SessionExpiredError
            ) {
                throw error;
            }


            consecutiveFailures +=
                1;

            lastFailure =
                error;


            /*
             * A temporary network failure should not
             * immediately abandon an accepted submission.
             *
             * Persistent failures are surfaced instead of
             * silently displaying "Judging" for 120 seconds.
             */
            if (
                consecutiveFailures >=
                MAX_CONSECUTIVE_POLL_FAILURES
            ) {
                throw lastFailure;
            }
        }


        onWaiting?.();


        await sleep(
            POLL_INTERVAL_MS
        );
    }


    return undefined;
}


export function determineSubmissionStatus(
    result: SubmissionResult
): "Passed" | "Not Passed" {
    if (
        result.records.length > 0 &&
        result.records.every(
            (record) =>
                record.result === "P"
        )
    ) {
        return "Passed";
    }


    return "Not Passed";
}


export function calculateQualityPercent(
    qualityScore: number
): number {
    const raw =
        (
            (qualityScore + 10)
            / 20
        )
        * 100;


    return (
        Math.round(
            raw * 100
        )
        / 100
    );
}


export function averageExecutionMs(
    result: SubmissionResult
): number | undefined {
    if (
        result.records.length === 0
    ) {
        return undefined;
    }


    const executions =
        result.records
            .map(
                (record) =>
                    record.execution
            )
            .filter(
                (
                    value
                ): value is number =>
                    value !== undefined
            );


    if (
        executions.length === 0
    ) {
        return undefined;
    }


    const total =
        executions.reduce(
            (
                sum,
                execution
            ) =>
                sum +
                execution,
            0
        );


    return (
        total /
        executions.length *
        1000
    );
}


export function formatScore(
    score: number
): string {
    return new Intl.NumberFormat(
        "en-US",
        {
            useGrouping:
                true,

            maximumFractionDigits:
                3,
        }
    ).format(
        score
    );
}


export function testcaseResultName(
    code: string
): string {
    switch (code) {
        case "P":
            return "Passed";

        case "-":
            return "Incorrect";

        case "T":
            return "Timeout";

        case "R":
            return "Restrict/Require Word";

        default:
            return "Error";
    }
}


function responseSaysSuccess(
    responseText: string
): boolean {
    const compact =
        responseText.replace(
            /\s+/g,
            ""
        );


    return compact.includes(
        '"success":true'
    );
}


function getSubmissionId(
    responseText: string
): number | undefined {
    const match =
        responseText.match(
            /"submissionId"\s*:\s*(\d+)/
        );


    if (!match) {
        return undefined;
    }


    const value =
        Number(
            match[1]
        );


    if (
        !Number.isSafeInteger(
            value
        ) ||
        value <= 0
    ) {
        return undefined;
    }


    return value;
}


function parseSubmissionResult(
    submissionId: number,
    source: string
): SubmissionResult | undefined {
    /*
     * Do not globally replace escaped quotes.
     *
     * Next.js can serialize the submission inside strings,
     * while the submitted source code can itself contain
     * escaped quotation marks.
     *
     * The parser therefore accepts both:
     *
     * "field"
     *
     * and:
     *
     * \"field\"
     */

    const submissionRegion =
        findSubmissionRegion(
            source,
            submissionId
        );


    if (!submissionRegion) {
        return undefined;
    }


    const resultString =
        extractStringField(
            submissionRegion,
            "result"
        );


    if (!resultString) {
        return undefined;
    }


    if (
        resultString === "Judging"
    ) {
        return undefined;
    }


    const score =
        extractNumberField(
            submissionRegion,
            "score"
        );


    if (
        score === undefined
    ) {
        return undefined;
    }


    const createdAt =
        extractStringField(
            submissionRegion,
            "created_at"
        ) ?? "";


    const qualityScore =
        extractNumberField(
            submissionRegion,
            "pep8_score"
        );


    const records =
        extractTestcaseRecords(
            submissionRegion
        );


    /*
     * Normal judged assignments are expected to have
     * testcase records.
     *
     * Returning undefined here causes polling to continue
     * briefly if the page is between judging states.
     */
    if (
        records.length === 0
    ) {
        return undefined;
    }


    return {
        submissionId,

        result:
            resultString,

        score,

        createdAt,

        qualityScore,

        records,
    };
}


function findSubmissionRegion(
    source: string,
    submissionId: number
): string | undefined {
    /*
     * \\?" means:
     *
     * optional backslash + quotation mark
     *
     * so both plain HTML JSON and escaped Next.js
     * serialization are accepted.
     */
    const pattern =
        new RegExp(
            `\\\\?"cps_id\\\\?"` +
            `\\s*:\\s*` +
            `${submissionId}` +
            `(?=\\s*[,}])`,
            "g"
        );


    const match =
        pattern.exec(
            source
        );


    if (
        !match ||
        match.index === undefined
    ) {
        return undefined;
    }


    /*
     * Everything relevant to this submission follows
     * cps_id on the overview page.
     *
     * No destructive unescaping is performed.
     */
    return source.slice(
        match.index
    );
}


function extractTestcaseRecords(
    source: string
): TestcaseResult[] {
    const records:
        TestcaseResult[] = [];


    const seenTestcases =
        new Set<number>();


    const pattern =
        /\\?"testcase_id\\?"\s*:\s*(\d+)\s*,\s*\\?"result\\?"\s*:\s*\\?"([^"\\]*)\\?"\s*,\s*\\?"execution\\?"\s*:\s*(null|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g;


    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        const testcaseId =
            Number(
                match[1]
            );


        if (
            !Number.isSafeInteger(
                testcaseId
            ) ||
            seenTestcases.has(
                testcaseId
            )
        ) {
            continue;
        }


        seenTestcases.add(
            testcaseId
        );


        let execution:
            number | undefined;


        if (
            match[3] !== "null"
        ) {
            const parsedExecution =
                Number(
                    match[3]
                );


            if (
                Number.isFinite(
                    parsedExecution
                )
            ) {
                execution =
                    parsedExecution;
            }
        }


        records.push({
            testcaseId,

            result:
                match[2],

            execution,
        });
    }


    records.sort(
        (a, b) =>
            a.testcaseId -
            b.testcaseId
    );


    return records;
}


function extractStringField(
    source: string,
    field: string
): string | undefined {
    const escapedField =
        escapeRegExp(
            field
        );


    const pattern =
        new RegExp(
            `\\\\?"${escapedField}\\\\?"` +
            `\\s*:\\s*` +
            `\\\\?"([^"\\\\]*)\\\\?"`
        );


    const match =
        source.match(
            pattern
        );


    return match?.[1];
}


function extractNumberField(
    source: string,
    field: string
): number | undefined {
    const escapedField =
        escapeRegExp(
            field
        );


    const pattern =
        new RegExp(
            `\\\\?"${escapedField}\\\\?"` +
            `\\s*:\\s*` +
            `(null|` +
            `[-+]?\\d+(?:\\.\\d+)?` +
            `(?:[eE][-+]?\\d+)?` +
            `)`
        );


    const match =
        source.match(
            pattern
        );


    if (
        !match ||
        match[1] === "null"
    ) {
        return undefined;
    }


    const value =
        Number(
            match[1]
        );


    if (
        !Number.isFinite(
            value
        )
    ) {
        return undefined;
    }


    return value;
}


function checkSessionResponse(
    response: Response
): void {
    if (
        response.status === 401 ||
        response.status === 403
    ) {
        throw new SessionExpiredError();
    }


    if (
        !isRedirectStatus(
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


function isRedirectStatus(
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


function escapeRegExp(
    value: string
): string {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}


function sleep(
    milliseconds: number
): Promise<void> {
    return new Promise(
        (resolve) => {
            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
}