import * as vscode from "vscode";

import {
    checkLoginStatus,
    ensureAuthenticated,
    getAccessToken,
    login,
    logout,
} from "./auth";

import {
    getEnrolledCourses,
} from "./courses";

import {
    IJudgeCompatibilityError,
    SessionExpiredError,
} from "./errors";

import {
    AssignmentMatch,
    findAssignment,
    validateAssignment,
} from "./problems";

import {
    detectProblemId,
} from "./source";

import {
    averageExecutionMs,
    calculateQualityPercent,
    determineSubmissionStatus,
    formatCodeQualityIssue,
    formatScore,
    SubmissionResult,
    submitSource,
    testcaseResultName,
    waitForSubmission,
} from "./submissions";

import {
    IJudgeTerminal,
} from "./terminal";


const COMMANDS = {
    submit:
        "micknorj.tools.ijudge.submit",

    login:
        "micknorj.tools.ijudge.login",

    logout:
        "micknorj.tools.ijudge.logout",

    loginStatus:
        "micknorj.tools.ijudge.loginStatus",
};


interface PreparedSource {
    code: string;
    problemId: number;
}


interface RetryResult<T> {
    token: string;
    value: T;
}


let submissionInProgress =
    false;


export function activate(
    context: vscode.ExtensionContext
): void {
    const terminal =
        new IJudgeTerminal();

    context.subscriptions.push(
        terminal,

        vscode.commands.registerCommand(
            COMMANDS.submit,
            () =>
                handleSubmit(
                    context.secrets,
                    terminal
                )
        ),

        vscode.commands.registerCommand(
            COMMANDS.login,
            () =>
                login(
                    context.secrets,
                    terminal
                )
        ),

        vscode.commands.registerCommand(
            COMMANDS.logout,
            () =>
                logout(
                    context.secrets,
                    terminal
                )
        ),

        vscode.commands.registerCommand(
            COMMANDS.loginStatus,
            () =>
                checkLoginStatus(
                    context.secrets,
                    terminal
                )
        )
    );
}


async function handleSubmit(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<void> {
    if (
        submissionInProgress
    ) {
        terminal.show(true);

        terminal.writeLine();
        terminal.writeSection(
            "Submission",
            [
                {
                    label:
                        "Status",

                    value:
                        "Already in progress",
                },
            ]
        );

        return;
    }

    submissionInProgress =
        true;

    try {
        await performSubmission(
            secrets,
            terminal
        );
    } catch (error) {
        terminal.show(true);

        printError(
            terminal,
            "Unexpected extension error.",
            error
        );
    } finally {
        submissionInProgress =
            false;
    }
}


async function performSubmission(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<void> {
    const source =
        await prepareSource(
            terminal
        );

    if (!source) {
        return;
    }

    terminal.show(true);
    terminal.writeLine();

    let token =
        await ensureAuthenticated(
            secrets,
            terminal
        );

    if (!token) {
        terminal.writeLine(
            "Submission cancelled."
        );

        return;
    }

    terminal.writeLine(
        "Finding assignment..."
    );

    let discovery:
        RetryResult<
            AssignmentMatch |
            undefined
        > |
        undefined;

    try {
        discovery =
            await runWithReauthentication(
                token,
                (
                    currentToken
                ) =>
                    discoverAssignment(
                        source.problemId,
                        currentToken
                    ),
                secrets,
                terminal,
                {
                    expiredMessage:
                        "Session expired while finding the assignment.",

                    onResume:
                        () =>
                            terminal.writeLine(
                                "Resuming assignment discovery..."
                            ),
                }
            );
    } catch (error) {
        printError(
            terminal,
            "Could not discover the assignment.",
            error
        );

        return;
    }

    if (!discovery) {
        terminal.writeLine(
            "Submission cancelled."
        );

        return;
    }

    token =
        discovery.token;

    const assignment =
        discovery.value;

    if (!assignment) {
        terminal.writeLine();
        terminal.writeSection(
            "Assignment",
            [
                {
                    label:
                        "Problem",

                    value:
                        String(
                            source.problemId
                        ),
                },
                {
                    label:
                        "Status",

                    value:
                        "Not found in an available enrolled course",
                },
            ]
        );

        return;
    }

    const validationError =
        validateAssignment(
            assignment.problem
        );

    printAssignment(
        terminal,
        assignment,
        validationError
            ? "Unavailable"
            : "Available"
    );

    if (validationError) {
        terminal.writeLine();
        terminal.writeSection(
            "Restriction",
            [
                validationError,
            ]
        );

        return;
    }

    terminal.writeLines(
        "",
        "Submitting..."
    );

    let submission:
        RetryResult<number> |
        undefined;

    try {
        submission =
            await runWithReauthentication(
                token,
                (
                    currentToken
                ) =>
                    submitSource({
                        problemId:
                            assignment.problem.id,

                        courseId:
                            assignment.course.id,

                        language:
                            assignment.problem.language,

                        code:
                            source.code,

                        accessToken:
                            currentToken,
                    }),
                secrets,
                terminal,
                {
                    expiredMessage:
                        "Session expired.",

                    onResume:
                        () =>
                            terminal.writeLine(
                                "Resuming submission..."
                            ),
                }
            );
    } catch (error) {
        printError(
            terminal,
            "Submission failed.",
            error
        );

        return;
    }

    if (!submission) {
        terminal.writeLine(
            "Submission cancelled."
        );

        return;
    }

    token =
        submission.token;

    const submissionId =
        submission.value;

    terminal.writeLine();
    terminal.writeSection(
        "Submission",
        [
            {
                label:
                    "ID",

                value:
                    String(
                        submissionId
                    ),
            },
            {
                label:
                    "Status",

                value:
                    "Judging",
            },
        ]
    );

    terminal.write(
        "\r\nProgress: "
    );

    let judging:
        RetryResult<
            SubmissionResult |
            undefined
        > |
        undefined;

    try {
        judging =
            await runWithReauthentication(
                token,
                (
                    currentToken
                ) =>
                    waitForSubmission(
                        submissionId,
                        currentToken,
                        () =>
                            terminal.write(
                                "."
                            )
                    ),
                secrets,
                terminal,
                {
                    expiredMessage:
                        "Session expired while waiting for the result.",

                    beforeMessage:
                        () =>
                            terminal.writeLines(
                                "",
                                ""
                            ),

                    onResume:
                        () =>
                            terminal.write(
                                "Progress: "
                            ),
                }
            );
    } catch (error) {
        terminal.writeLine();

        printError(
            terminal,
            "Could not retrieve the submission result.",
            error
        );

        return;
    }

    terminal.writeLine();

    if (!judging) {
        terminal.writeLine();
        terminal.writeSection(
            "Submission",
            [
                {
                    label:
                        "ID",

                    value:
                        String(
                            submissionId
                        ),
                },
                {
                    label:
                        "Status",

                    value:
                        "Stopped waiting; submission was not cancelled",
                },
            ]
        );

        return;
    }

    if (!judging.value) {
        terminal.writeLine();
        terminal.writeSection(
            "Submission",
            [
                {
                    label:
                        "ID",

                    value:
                        String(
                            submissionId
                        ),
                },
                {
                    label:
                        "Status",

                    value:
                        "Still judging",
                },
                {
                    label:
                        "Wait",

                    value:
                        "Stopped after 120 seconds; submission was not cancelled",
                },
            ]
        );

        return;
    }

    printSubmissionResult(
        terminal,
        judging.value
    );
}


async function prepareSource(
    terminal: IJudgeTerminal
): Promise<
    PreparedSource |
    undefined
> {
    const editor =
        vscode.window.activeTextEditor;

    if (!editor) {
        showTerminalError(
            terminal,
            "No active file is open."
        );

        return undefined;
    }

    const document =
        editor.document;

    if (
        document.languageId !==
        "python"
    ) {
        showTerminalError(
            terminal,
            "The active file is not Python."
        );

        return undefined;
    }

    if (
        document.isUntitled
    ) {
        showTerminalError(
            terminal,
            "Save the file before submitting."
        );

        return undefined;
    }

    if (
        !await document.save()
    ) {
        showTerminalError(
            terminal,
            "Could not save the active file."
        );

        return undefined;
    }

    const code =
        document.getText();

    if (!code.trim()) {
        showTerminalError(
            terminal,
            "The active file is empty."
        );

        return undefined;
    }

    const problemId =
        detectProblemId(
            code
        );

    if (!problemId) {
        showTerminalError(
            terminal,
            "No iJudge problem ID found."
        );

        terminal.writeLine(
            'Use """3155""", # 3155, or # ijudge: 3155.'
        );

        return undefined;
    }

    return {
        code,
        problemId,
    };
}


async function discoverAssignment(
    problemId: number,
    accessToken: string
): Promise<
    AssignmentMatch |
    undefined
> {
    const courses =
        await getEnrolledCourses(
            accessToken
        );

    if (
        courses.length === 0
    ) {
        throw new Error(
            "No enrolled iJudge courses were found."
        );
    }

    return findAssignment(
        problemId,
        courses,
        accessToken
    );
}


async function runWithReauthentication<T>(
    accessToken: string,
    operation:
        (
            token: string
        ) => Promise<T>,
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal,
    options: {
        expiredMessage: string;
        beforeMessage?: () => void;
        onResume?: () => void;
    }
): Promise<
    RetryResult<T> |
    undefined
> {
    try {
        return {
            token:
                accessToken,

            value:
                await operation(
                    accessToken
                ),
        };
    } catch (error) {
        if (
            !(error instanceof
                SessionExpiredError)
        ) {
            throw error;
        }
    }

    options.beforeMessage?.();

    terminal.writeLines(
        options.expiredMessage,
        "Login is required to continue.",
        ""
    );

    const token =
        await reauthenticate(
            secrets,
            terminal
        );

    if (!token) {
        return undefined;
    }

    options.onResume?.();

    return {
        token,

        value:
            await operation(
                token
            ),
    };
}


async function reauthenticate(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<
    string |
    undefined
> {
    return (
        await login(
            secrets,
            terminal
        )
    )
        ? getAccessToken(
            secrets
        )
        : undefined;
}


function printAssignment(
    terminal: IJudgeTerminal,
    assignment: AssignmentMatch,
    status: "Available" | "Unavailable"
): void {
    terminal.writeLine();
    terminal.writeSection(
        "Assignment",
        [
            {
                label:
                    "Problem",

                value:
                    `${assignment.problem.id} - ${assignment.problem.title}`,
            },
            {
                label:
                    "Course",

                value:
                    assignment.course.name,
            },
            {
                label:
                    "Language",

                value:
                    assignment.problem.language,
            },
            {
                label:
                    "Status",

                value:
                    status,
            },
        ]
    );
}


function printSubmissionResult(
    terminal: IJudgeTerminal,
    result: SubmissionResult
): void {
    const status =
        determineSubmissionStatus(
            result
        );

    const passed =
        result.records.filter(
            (
                record
            ) =>
                record.result ===
                "P"
        ).length;

    const average =
        averageExecutionMs(
            result
        );

    const resultRows = [
        {
            label:
                "Status",

            value:
                status,
        },
        {
            label:
                "Testcases",

            value:
                `${passed}/${result.records.length} passed`,
        },
        {
            label:
                "Score",

            value:
                formatScore(
                    result.score
                ),
        },
    ];

    if (
        average !==
        undefined
    ) {
        resultRows.push({
            label:
                "Average execution",

            value:
                `${average.toFixed(2)} ms`,
        });
    }

    if (
        status !==
        "Passed"
    ) {
        resultRows.push({
            label:
                "Result code",

            value:
                result.result,
        });
    }

    terminal.writeLine();
    terminal.writeSection(
        "Result",
        resultRows
    );

    if (
        result.qualityScore !==
        undefined
    ) {
        const qualityPercent =
            calculateQualityPercent(
                result.qualityScore
            );

        const issueRows =
            qualityPercent < 100
                ? result.qualityIssues.map(
                    (
                        issue
                    ) =>
                        `- ${
                            formatCodeQualityIssue(
                                issue
                            )
                        }`
                )
                : [];

        terminal.writeLine();
        terminal.writeSection(
            "Code Quality",
            [
                {
                    label:
                        "Score",

                    value:
                        `${
                            qualityPercent.toFixed(
                                2
                            )
                        }%`,
                },
                ...(
                    issueRows.length > 0
                        ? [
                            "Issues:",
                            ...issueRows,
                        ]
                        : []
                ),
            ]
        );
    }

    terminal.writeLine();
    terminal.writeSection(
        "Test Cases",
        result.records.map(
            (
                record,
                index
            ) => {
                const execution =
                    record.execution ===
                    undefined
                        ? ""
                        : ` (${(
                            record.execution *
                            1000
                        ).toFixed(2)} ms)`;

                return (
                    `${
                        String(
                            index + 1
                        ).padStart(
                            2,
                            " "
                        )
                    }  ${
                        testcaseResultName(
                            record.result
                        )
                    }${execution}`
                );
            }
        )
    );
}


function printError(
    terminal: IJudgeTerminal,
    heading: string,
    error: unknown
): void {
    if (
        error instanceof
        IJudgeCompatibilityError
    ) {
        printCompatibilityError(
            terminal,
            heading,
            error
        );

        return;
    }

    terminal.writeLine();
    terminal.writeSection(
        "Error",
        [
            {
                label:
                    "Operation",

                value:
                    heading,
            },
            {
                label:
                    "Reason",

                value:
                    getErrorMessage(
                        error
                    ),
            },
        ]
    );
}


function printCompatibilityError(
    terminal: IJudgeTerminal,
    heading: string,
    error: IJudgeCompatibilityError
): void {
    terminal.writeLine();
    terminal.writeSection(
        "Compatibility",
        [
            {
                label:
                    "Operation",

                value:
                    heading,
            },
            {
                label:
                    "Reason",

                value:
                    error.message,
            },
            "The extension stopped rather than using unverified frontend data.",
        ]
    );
}


function showTerminalError(
    terminal: IJudgeTerminal,
    message: string
): void {
    terminal.show(true);

    terminal.writeLine();
    terminal.writeSection(
        "Error",
        [
            message,
        ]
    );
}


function getErrorMessage(
    error: unknown
): string {
    return (
        error instanceof Error
    )
        ? error.message
        : String(
            error
        );
}
