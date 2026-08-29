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


const SUBMIT_COMMAND =
    "micknorj.tools.ijudge.submit";

const LOGIN_COMMAND =
    "micknorj.tools.ijudge.login";

const LOGOUT_COMMAND =
    "micknorj.tools.ijudge.logout";

const LOGIN_STATUS_COMMAND =
    "micknorj.tools.ijudge.loginStatus";


let submissionInProgress =
    false;


export function activate(
    context: vscode.ExtensionContext
): void {
    const terminal =
        new IJudgeTerminal();


    const submitCommand =
        vscode.commands.registerCommand(
            SUBMIT_COMMAND,
            async () => {
                await handleSubmit(
                    context.secrets,
                    terminal
                );
            }
        );


    const loginCommand =
        vscode.commands.registerCommand(
            LOGIN_COMMAND,
            async () => {
                await login(
                    context.secrets,
                    terminal
                );
            }
        );


    const logoutCommand =
        vscode.commands.registerCommand(
            LOGOUT_COMMAND,
            async () => {
                await logout(
                    context.secrets,
                    terminal
                );
            }
        );


    const loginStatusCommand =
        vscode.commands.registerCommand(
            LOGIN_STATUS_COMMAND,
            async () => {
                await checkLoginStatus(
                    context.secrets,
                    terminal
                );
            }
        );


    context.subscriptions.push(
        terminal,
        submitCommand,
        loginCommand,
        logoutCommand,
        loginStatusCommand
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

        terminal.writeLine(
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
        terminal.writeLine();

        terminal.writeLine(
            "Unexpected extension error."
        );

        terminal.writeLine(
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
    const editor =
        vscode.window.activeTextEditor;


    if (!editor) {
        showTerminalError(
            terminal,
            "No active file is open."
        );

        return;
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

        return;
    }


    if (
        document.isUntitled
    ) {
        showTerminalError(
            terminal,
            "Save the file before submitting."
        );

        return;
    }


    const saved =
        await document.save();


    if (!saved) {
        showTerminalError(
            terminal,
            "Could not save the active file."
        );

        return;
    }


    const code =
        document.getText();


    if (
        !code.trim()
    ) {
        showTerminalError(
            terminal,
            "The active file is empty."
        );

        return;
    }


    const problemId =
        detectProblemId(
            code
        );


    if (!problemId) {
        terminal.show(true);
        terminal.writeLine();

        terminal.writeLine(
            "Error: No iJudge problem ID found."
        );

        terminal.writeLine(
            'Use """3155""", # 3155, or # ijudge: 3155.'
        );

        return;
    }


    terminal.show(true);
    terminal.writeLine();


    let accessToken =
        await ensureAuthenticated(
            secrets,
            terminal
        );


    if (!accessToken) {
        terminal.writeLine(
            "Submission cancelled."
        );

        return;
    }


    /*
     * ===================================================
     * Assignment discovery
     * ===================================================
     */

    terminal.writeLine(
        "Finding assignment..."
    );


    let assignment:
        AssignmentMatch | undefined;


    try {
        assignment =
            await discoverAssignment(
                problemId,
                accessToken
            );
    } catch (error) {
        if (
            error instanceof
            SessionExpiredError
        ) {
            terminal.writeLine(
                "Session expired while finding the assignment."
            );

            terminal.writeLine(
                "Login is required to continue."
            );

            terminal.writeLine();


            const newToken =
                await reauthenticate(
                    secrets,
                    terminal
                );


            if (!newToken) {
                terminal.writeLine(
                    "Submission cancelled."
                );

                return;
            }


            accessToken =
                newToken;


            terminal.writeLine(
                "Resuming assignment discovery..."
            );


            try {
                assignment =
                    await discoverAssignment(
                        problemId,
                        accessToken
                    );
            } catch (
                retryError
            ) {
                printDiscoveryError(
                    terminal,
                    retryError
                );

                return;
            }
        } else {
            printDiscoveryError(
                terminal,
                error
            );

            return;
        }
    }


    if (!assignment) {
        terminal.writeLine();

        terminal.writeLine(
            `Problem ${problemId} was not found ` +
            "in any available enrolled course."
        );

        return;
    }


    /*
     * ===================================================
     * Assignment validation
     * ===================================================
     */

    const validationError =
        validateAssignment(
            assignment.problem
        );


    terminal.writeLine();


    terminal.writeLine(
        `Problem:  ` +
        `${assignment.problem.id} - ` +
        `${assignment.problem.title}`
    );


    terminal.writeLine(
        `Course:   ` +
        `${assignment.course.name}`
    );


    terminal.writeLine(
        `Language: ` +
        `${assignment.problem.language}`
    );


    if (
        validationError
    ) {
        terminal.writeLine(
            "Status:   Unavailable"
        );

        terminal.writeLine();

        terminal.writeLine(
            validationError
        );

        return;
    }


    terminal.writeLine(
        "Status:   Available"
    );


    /*
     * ===================================================
     * Submit
     * ===================================================
     */

    terminal.writeLine();

    terminal.writeLine(
        "Submitting..."
    );


    let submissionId:
        number;


    try {
        submissionId =
            await submitSource({
                problemId:
                    assignment.problem.id,

                courseId:
                    assignment.course.id,

                language:
                    assignment.problem.language,

                code,

                accessToken,
            });
    } catch (error) {
        /*
         * Only repeat the POST after an explicit
         * authentication failure.
         *
         * Ambiguous failures are never retried because
         * the original submission may have succeeded.
         */
        if (
            error instanceof
            SessionExpiredError
        ) {
            terminal.writeLine(
                "Session expired."
            );

            terminal.writeLine(
                "Login is required to continue."
            );

            terminal.writeLine();


            const newToken =
                await reauthenticate(
                    secrets,
                    terminal
                );


            if (!newToken) {
                terminal.writeLine(
                    "Submission cancelled."
                );

                return;
            }


            accessToken =
                newToken;


            terminal.writeLine(
                "Resuming submission..."
            );


            try {
                submissionId =
                    await submitSource({
                        problemId:
                            assignment.problem.id,

                        courseId:
                            assignment.course.id,

                        language:
                            assignment.problem.language,

                        code,

                        accessToken,
                    });
            } catch (
                retryError
            ) {
                printSubmissionError(
                    terminal,
                    retryError
                );

                return;
            }
        } else {
            printSubmissionError(
                terminal,
                error
            );

            return;
        }
    }


    terminal.writeLine(
        `Submission ID: ${submissionId}`
    );


    /*
     * ===================================================
     * Judging
     * ===================================================
     */

    terminal.writeLine();

    terminal.write(
        "Judging"
    );


    let result:
        SubmissionResult | undefined;


    try {
        result =
            await waitForSubmission(
                submissionId,
                accessToken,
                () => {
                    terminal.write(
                        "."
                    );
                }
            );
    } catch (error) {
        if (
            error instanceof
            SessionExpiredError
        ) {
            terminal.writeLine();
            terminal.writeLine();

            terminal.writeLine(
                "Session expired while waiting for the result."
            );

            terminal.writeLine(
                "Login is required to continue."
            );

            terminal.writeLine();


            const newToken =
                await reauthenticate(
                    secrets,
                    terminal
                );


            if (!newToken) {
                terminal.writeLine(
                    "Stopped waiting."
                );

                terminal.writeLine(
                    `Submission ${submissionId} ` +
                    "was not cancelled."
                );

                return;
            }


            accessToken =
                newToken;


            terminal.write(
                "Judging"
            );


            try {
                result =
                    await waitForSubmission(
                        submissionId,
                        accessToken,
                        () => {
                            terminal.write(
                                "."
                            );
                        }
                    );
            } catch (
                retryError
            ) {
                printResultError(
                    terminal,
                    retryError
                );

                return;
            }
        } else {
            printResultError(
                terminal,
                error
            );

            return;
        }
    }


    terminal.writeLine();


    /*
     * ===================================================
     * Poll timeout
     * ===================================================
     */

    if (!result) {
        terminal.writeLine();

        terminal.writeLine(
            "Still judging."
        );

        terminal.writeLine(
            "Stopped waiting after 120 seconds."
        );

        terminal.writeLine(
            `Submission ID: ${submissionId}`
        );

        terminal.writeLine(
            "The submission was not cancelled."
        );

        return;
    }


    printSubmissionResult(
        terminal,
        result
    );
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


async function reauthenticate(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<string | undefined> {
    const loggedIn =
        await login(
            secrets,
            terminal
        );


    if (!loggedIn) {
        return undefined;
    }


    return getAccessToken(
        secrets
    );
}


function printDiscoveryError(
    terminal: IJudgeTerminal,
    error: unknown
): void {
    terminal.writeLine();

    terminal.writeLine(
        "Could not discover the assignment."
    );

    terminal.writeLine(
        getErrorMessage(
            error
        )
    );
}


function printSubmissionError(
    terminal: IJudgeTerminal,
    error: unknown
): void {
    terminal.writeLine();

    terminal.writeLine(
        "Submission failed."
    );

    terminal.writeLine(
        getErrorMessage(
            error
        )
    );
}


function printResultError(
    terminal: IJudgeTerminal,
    error: unknown
): void {
    terminal.writeLine();
    terminal.writeLine();

    terminal.writeLine(
        "Could not retrieve the submission result."
    );

    terminal.writeLine(
        getErrorMessage(
            error
        )
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


    const passedCount =
        result.records.filter(
            (record) =>
                record.result === "P"
        ).length;


    const averageMs =
        averageExecutionMs(
            result
        );


    terminal.writeLine();

    terminal.writeLine(
        status
    );

    terminal.writeLine();


    terminal.writeLine(
        `Testcases:         ` +
        `${passedCount}/${result.records.length} passed`
    );


    terminal.writeLine(
        `Score:             ` +
        `${formatScore(result.score)}`
    );


    if (
        result.qualityScore !==
        undefined
    ) {
        const quality =
            calculateQualityPercent(
                result.qualityScore
            );


        terminal.writeLine(
            `Quality:           ` +
            `${quality.toFixed(2)}%`
        );
    }


    if (
        averageMs !==
        undefined
    ) {
        terminal.writeLine(
            `Average execution: ` +
            `${averageMs.toFixed(2)} ms`
        );
    }


    if (
        status !== "Passed"
    ) {
        terminal.writeLine(
            `Result code:       ` +
            `${result.result}`
        );
    }


    terminal.writeLine();

    terminal.writeLine(
        "Test cases:"
    );


    result.records.forEach(
        (
            record,
            index
        ) => {
            const number =
                String(
                    index + 1
                ).padStart(
                    2,
                    " "
                );


            terminal.writeLine(
                `${number}  ` +
                `${testcaseResultName(record.result)}`
            );
        }
    );


    terminal.writeLine();

    terminal.writeLine(
        `Submission ID: ` +
        `${result.submissionId}`
    );
}


function showTerminalError(
    terminal: IJudgeTerminal,
    message: string
): void {
    terminal.show(true);

    terminal.writeLine();

    terminal.writeLine(
        `Error: ${message}`
    );
}


function getErrorMessage(
    error: unknown
): string {
    if (
        error instanceof Error
    ) {
        return error.message;
    }


    return String(
        error
    );
}


export function deactivate(): void {
    // Resources are disposed through context.subscriptions.
}