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

        terminal.writeLines(
            "",
            "A submission is already in progress."
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

        terminal.writeLines(
            "",
            "Unexpected extension error.",
            getErrorMessage(
                error
            )
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
        terminal.writeLines(
            "",
            `Problem ${source.problemId} was not found in any available enrolled course.`
        );

        return;
    }

    printAssignment(
        terminal,
        assignment
    );

    const validationError =
        validateAssignment(
            assignment.problem
        );

    if (validationError) {
        terminal.writeLines(
            "Status:   Unavailable",
            "",
            validationError
        );

        return;
    }

    terminal.writeLines(
        "Status:   Available",
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

    terminal.writeLines(
        `Submission ID: ${submissionId}`,
        ""
    );

    terminal.write(
        "Judging"
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
                                "Judging"
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
        terminal.writeLines(
            "",
            "Stopped waiting.",
            `Submission ${submissionId} was not cancelled.`
        );

        return;
    }

    if (!judging.value) {
        terminal.writeLines(
            "",
            "Still judging.",
            "Stopped waiting after 120 seconds.",
            `Submission ID: ${submissionId}`,
            "The submission was not cancelled."
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
): Promise<PreparedSource | undefined> {
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
): Promise<AssignmentMatch | undefined> {
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
): Promise<RetryResult<T> | undefined> {
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
): Promise<string | undefined> {
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
    assignment: AssignmentMatch
): void {
    terminal.writeLines(
        "",
        `Problem:  ${assignment.problem.id} - ${assignment.problem.title}`,
        `Course:   ${assignment.course.name}`,
        `Language: ${assignment.problem.language}`
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
                record.result === "P"
        ).length;

    const average =
        averageExecutionMs(
            result
        );

    terminal.writeLines(
        "",
        status,
        "",
        `Testcases:         ${passed}/${result.records.length} passed`,
        `Score:             ${formatScore(result.score)}`
    );

    if (
        result.qualityScore !==
        undefined
    ) {
        terminal.writeLine(
            `Quality:           ${
                calculateQualityPercent(
                    result.qualityScore
                ).toFixed(
                    2
                )
            }%`
        );
    }

    if (
        average !== undefined
    ) {
        terminal.writeLine(
            `Average execution: ${average.toFixed(2)} ms`
        );
    }

    if (
        status !== "Passed"
    ) {
        terminal.writeLine(
            `Result code:       ${result.result}`
        );
    }

    terminal.writeLines(
        "",
        "Test cases:"
    );

    result.records.forEach(
        (
            record,
            index
        ) =>
            terminal.writeLine(
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
                }`
            )
    );

    terminal.writeLines(
        "",
        `Submission ID: ${result.submissionId}`
    );
}


function printError(
    terminal: IJudgeTerminal,
    heading: string,
    error: unknown
): void {
    terminal.writeLines(
        "",
        heading,
        getErrorMessage(
            error
        )
    );
}


function showTerminalError(
    terminal: IJudgeTerminal,
    message: string
): void {
    terminal.show(true);

    terminal.writeLines(
        "",
        `Error: ${message}`
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
