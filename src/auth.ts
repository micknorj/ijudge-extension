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
    const token =
        await getAccessToken(
            secrets
        );

    if (token) {
        try {
            if (
                await isSessionValid(
                    token
                )
            ) {
                return token;
            }

            await clearAuthentication(
                secrets
            );

            terminal.writeLines(
                "Your iJudge session has expired.",
                "Login is required to continue."
            );
        } catch (error) {
            terminal.writeLines(
                "Could not verify the saved iJudge session.",
                getErrorMessage(
                    error
                )
            );

            return undefined;
        }
    } else {
        terminal.writeLines(
            "You are not logged in to iJudge.",
            "Login is required to continue."
        );
    }

    terminal.writeLine();

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


export async function login(
    secrets: vscode.SecretStorage,
    terminal: IJudgeTerminal
): Promise<boolean> {
    terminal.show(false);

    terminal.writeLines(
        "iJudge Login",
        "------------"
    );

    const username =
        (
            await terminal.prompt(
                "Username: "
            )
        )?.trim();

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

    terminal.writeLines(
        "",
        "Signing in..."
    );

    try {
        const result =
            await loginToIJudge(
                username,
                password
            );

        clearRuntimeCaches();

        await secrets.store(
            ACCESS_TOKEN_KEY,
            result.accessToken
        );

        terminal.writeLines(
            "Login successful.",
            ""
        );

        return true;
    } catch (error) {
        terminal.writeLines(
            `Login failed: ${getErrorMessage(error)}`,
            ""
        );

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

    terminal.writeLines(
        "",
        "Logged out."
    );
}


export function getAccessToken(
    secrets: vscode.SecretStorage
): Thenable<string | undefined> {
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
        if (
            await isSessionValid(
                token
            )
        ) {
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
            `Could not check login status: ${getErrorMessage(error)}`
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
    return (
        error instanceof Error
    )
        ? error.message
        : String(
            error
        );
}