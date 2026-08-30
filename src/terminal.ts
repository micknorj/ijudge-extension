import * as vscode from "vscode";


const MAX_INPUT_LENGTH =
    4096;


interface PendingInput {
    resolve:
        (
            value:
                string |
                undefined
        ) => void;

    hidden: boolean;
}


export class IJudgeTerminal
implements vscode.Disposable {
    private readonly writeEmitter =
        new vscode.EventEmitter<string>();

    private readonly closeSubscription:
        vscode.Disposable;

    private terminal:
        vscode.Terminal |
        undefined;

    private pending:
        PendingInput |
        undefined;

    private input =
        "";


    private readonly pty:
        vscode.Pseudoterminal = {
            onDidWrite:
                this.writeEmitter.event,

            open:
                () => {
                    this.writeLines(
                        "iJudge Extension",
                        ""
                    );
                },

            close:
                () =>
                    this.cancelInput(),

            handleInput:
                (
                    data
                ) =>
                    this.handleInput(
                        data
                    ),
        };


    constructor() {
        this.closeSubscription =
            vscode.window
                .onDidCloseTerminal(
                    (
                        terminal
                    ) => {
                        if (
                            terminal ===
                            this.terminal
                        ) {
                            this.terminal =
                                undefined;

                            this.cancelInput();
                        }
                    }
                );
    }


    show(
        preserveFocus = false
    ): void {
        if (!this.terminal) {
            this.terminal =
                vscode.window
                    .createTerminal({
                        name:
                            "iJudge",

                        pty:
                            this.pty,
                    });
        }

        this.terminal.show(
            preserveFocus
        );
    }


    write(
        text: string
    ): void {
        this.writeEmitter.fire(
            text
        );
    }


    writeLine(
        text = ""
    ): void {
        this.write(
            `${text}\r\n`
        );
    }


    writeLines(
        ...lines: string[]
    ): void {
        for (
            const line
            of lines
        ) {
            this.writeLine(
                line
            );
        }
    }


    async prompt(
        prompt: string,
        hidden = false
    ): Promise<string | undefined> {
        if (this.pending) {
            throw new Error(
                "Another iJudge input prompt is already active."
            );
        }

        this.show(false);
        this.write(
            prompt
        );

        this.input =
            "";

        return new Promise(
            (
                resolve
            ) => {
                this.pending = {
                    resolve,
                    hidden,
                };
            }
        );
    }


    private handleInput(
        data: string
    ): void {
        if (
            !this.pending ||
            data.startsWith(
                "\x1b"
            )
        ) {
            return;
        }

        for (
            const character
            of data
        ) {
            if (!this.pending) {
                break;
            }

            if (
                character === "\r" ||
                character === "\n"
            ) {
                this.finishInput();
                continue;
            }

            if (
                character === "\x03"
            ) {
                this.write(
                    "^C\r\n"
                );

                this.cancelInput();
                continue;
            }

            if (
                character === "\x7f" ||
                character === "\b"
            ) {
                this.backspace();
                continue;
            }

            if (
                character >= " " &&
                this.input.length <
                    MAX_INPUT_LENGTH
            ) {
                this.input +=
                    character;

                this.write(
                    this.pending.hidden
                        ? "*"
                        : character
                );
            }
        }
    }


    private backspace():
        void {
        if (
            !this.pending ||
            this.input.length === 0
        ) {
            return;
        }

        this.input =
            this.input.slice(
                0,
                -1
            );

        this.write(
            "\b \b"
        );
    }


    private finishInput():
        void {
        if (!this.pending) {
            return;
        }

        const pending =
            this.pending;

        const value =
            this.input;

        this.pending =
            undefined;

        this.input =
            "";

        this.write(
            "\r\n"
        );

        pending.resolve(
            value
        );
    }


    private cancelInput():
        void {
        if (!this.pending) {
            return;
        }

        const pending =
            this.pending;

        this.pending =
            undefined;

        this.input =
            "";

        pending.resolve(
            undefined
        );
    }


    dispose():
        void {
        this.cancelInput();

        this.terminal?.dispose();

        this.terminal =
            undefined;

        this.closeSubscription.dispose();
        this.writeEmitter.dispose();
    }
}