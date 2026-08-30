import {
    getSubmitAction,
    invalidateSubmitAction,
} from "./actions";

import {
    SessionExpiredError,
} from "./errors";

import {
    assertAuthenticatedResponse,
    fetchIJudge,
    readTextLimited,
} from "./http";

import {
    parseSubmissionResult,
    SubmissionResult,
} from "./submission-result";


export {
    averageExecutionMs,
    calculateQualityPercent,
    determineSubmissionStatus,
    formatScore,
    SubmissionResult,
    testcaseResultName,
    TestcaseResult,
} from "./submission-result";


const REQUEST_TIMEOUT_MS =
    30_000;

const POLL_INTERVAL_MS =
    1_000;

const POLL_TIMEOUT_MS =
    120_000;

const MAX_POLL_FAILURES =
    5;

const MAX_SUBMIT_RESPONSE_BYTES =
    1024 * 1024;

const MAX_RESULT_RESPONSE_BYTES =
    8 * 1024 * 1024;


export interface SubmitSourceOptions {
    problemId: number;
    courseId: number;
    language: string;
    code: string;
    accessToken: string;
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

    const path =
        `/problems/${problemId}/description?problemPage=0`;

    const action =
        await getSubmitAction(
            problemId,
            accessToken
        );

    const response =
        await fetchIJudge(
            path,
            {
                method:
                    "POST",

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
                        `https://ijudge.it.kmitl.ac.th${path}`,
                },

                body:
                    JSON.stringify(
                        [
                            {
                                code,

                                lang_type:
                                    language,

                                course_problem_id:
                                    problemId,

                                course_id:
                                    courseId,
                            },
                        ]
                    ),
            },
            accessToken,
            REQUEST_TIMEOUT_MS
        );

    assertAuthenticatedResponse(
        response
    );

    if (
        response.status !== 200
    ) {
        invalidateSubmitAction();

        throw new Error(
            `iJudge returned HTTP ${response.status} while submitting.`
        );
    }

    const text =
        await readTextLimited(
            response,
            MAX_SUBMIT_RESPONSE_BYTES,
            "submission response"
        );

    const submissionId =
        getSubmissionId(
            text
        );

    if (
        !/"success"\s*:\s*true/
            .test(
                text
            ) ||
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
    const response =
        await fetchIJudge(
            `/submissions/${submissionId}/overview`,
            {
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",
                },
            },
            accessToken,
            REQUEST_TIMEOUT_MS
        );

    assertAuthenticatedResponse(
        response
    );

    if (
        response.status === 404
    ) {
        return undefined;
    }

    if (!response.ok) {
        throw new Error(
            `iJudge returned HTTP ${response.status} while checking the result.`
        );
    }

    return parseSubmissionResult(
        submissionId,
        await readTextLimited(
            response,
            MAX_RESULT_RESPONSE_BYTES,
            "submission result"
        )
    );
}


export async function waitForSubmission(
    submissionId: number,
    accessToken: string,
    onWaiting?: () => void,
    timeoutMs =
        POLL_TIMEOUT_MS
): Promise<SubmissionResult | undefined> {
    const started =
        Date.now();

    let failures =
        0;

    while (
        Date.now() -
            started <
        timeoutMs
    ) {
        try {
            const result =
                await fetchSubmissionResult(
                    submissionId,
                    accessToken
                );

            failures =
                0;

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

            failures++;

            if (
                failures >=
                MAX_POLL_FAILURES
            ) {
                throw error;
            }
        }

        onWaiting?.();

        await sleep(
            POLL_INTERVAL_MS
        );
    }

    return undefined;
}


function getSubmissionId(
    text: string
): number | undefined {
    const value =
        Number(
            text.match(
                /"submissionId"\s*:\s*(\d+)/
            )?.[1]
        );

    return (
        Number.isSafeInteger(
            value
        ) &&
        value > 0
    )
        ? value
        : undefined;
}


function sleep(
    milliseconds: number
): Promise<void> {
    return new Promise(
        (resolve) =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}