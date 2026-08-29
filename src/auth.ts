import * as vscode from "vscode";

import {
    isSessionValid,
    loginToIJudge,
} from "./client";

import {
    clearCourseCache,
} from "./courses";

import {
    clearProblemCache,
} from "./problems";

import {
    IJudgeTerminal,
} from "./terminal";


const ACCESS_TOKEN_KEY =
    "micknorj.tools.ijudge.accessToken";


export async function ensureAuthenticated(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<string | undefined> {
    const savedToken =
        await getAccessToken(
            secrets
        );

    if (savedToken) {
        try {
            const valid =
                await isSessionValid(
                    savedToken
                );

            if (valid) {
                return savedToken;
            }

            await clearAuthentication(
                secrets
            );

            terminal.writeLine(
                "Your iJudge session has expired."
            );

            terminal.writeLine(
                "Login is required to continue."
            );
        } catch (error) {
            terminal.writeLine(
                "Could not verify the saved iJudge session."
            );

            terminal.writeLine(
                getErrorMessage(
                    error
                )
            );

            return undefined;
        }
    } else {
        terminal.writeLine(
            "You are not logged in to iJudge."
        );

        terminal.writeLine(
            "Login is required to continue."
        );
    }

    terminal.writeLine();

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


export async function login(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<boolean> {
    terminal.show(false);

    terminal.writeLine(
        "iJudge Login"
    );

    terminal.writeLine(
        "------------"
    );

    const usernameInput =
        await terminal.prompt(
            "Username: "
        );

    const username =
        usernameInput?.trim();

    if (!username) {
        terminal.writeLine(
            "Login cancelled."
        );

        return false;
    }

    const password =
        await terminal.prompt(
            "Password: ",
            true
        );

    if (!password) {
        terminal.writeLine(
            "Login cancelled."
        );

        return false;
    }

    terminal.writeLine();

    terminal.writeLine(
        "Signing in..."
    );

    try {
        const result =
            await loginToIJudge(
                username,
                password
            );

        /*
         * Clear cached account metadata before the
         * new session becomes active.
         */
        clearRuntimeCaches();

        await secrets.store(
            ACCESS_TOKEN_KEY,
            result.accessToken
        );

        terminal.writeLine(
            "Login successful."
        );

        terminal.writeLine();

        return true;
    } catch (error) {
        terminal.writeLine(
            `Login failed: ` +
            `${getErrorMessage(error)}`
        );

        terminal.writeLine();

        return false;
    }
}


export async function logout(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<void> {
    terminal.show(true);

    await clearAuthentication(
        secrets
    );

    terminal.writeLine();

    terminal.writeLine(
        "Logged out."
    );
}


export async function getAccessToken(
    secrets: vscode.SecretStorage
): Promise<string | undefined> {
    return secrets.get(
        ACCESS_TOKEN_KEY
    );
}


export async function checkLoginStatus(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<void> {
    terminal.show(true);
    terminal.writeLine();

    const token =
        await getAccessToken(
            secrets
        );

    if (!token) {
        terminal.writeLine(
            "Login status: Not logged in."
        );

        return;
    }

    terminal.writeLine(
        "Checking iJudge session..."
    );

    try {
        const valid =
            await isSessionValid(
                token
            );

        if (valid) {
            terminal.writeLine(
                "Login status: Session is valid."
            );

            return;
        }

        await clearAuthentication(
            secrets
        );

        terminal.writeLine(
            "Login status: Session expired."
        );
    } catch (error) {
        terminal.writeLine(
            "Could not check login status: " +
            getErrorMessage(
                error
            )
        );
    }
}


async function clearAuthentication(
    secrets: vscode.SecretStorage
): Promise<void> {
    await secrets.delete(
        ACCESS_TOKEN_KEY
    );

    clearRuntimeCaches();
}


function clearRuntimeCaches():
    void {
    clearCourseCache();
    clearProblemCache();
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
