import * as vscode from "vscode";

interface PendingInput {
    resolve: (value: string | undefined) => void;
    hidden: boolean;
}

export class IJudgeTerminal implements vscode.Disposable {
    private readonly writeEmitter =
        new vscode.EventEmitter<string>();

    private readonly closeSubscription:
        vscode.Disposable;

    private terminal: vscode.Terminal | undefined;
    private pendingInput: PendingInput | undefined;
    private inputBuffer = "";

    private readonly pty: vscode.Pseudoterminal = {
        onDidWrite: this.writeEmitter.event,

        open: () => {
            this.writeLine("iJudge Extension");
            this.writeLine();
        },

        close: () => {
            this.cancelPendingInput();
        },

        handleInput: (data: string) => {
            this.handleInput(data);
        },
    };

    constructor() {
        this.closeSubscription =
            vscode.window.onDidCloseTerminal((terminal) => {
                if (terminal === this.terminal) {
                    this.terminal = undefined;
                    this.cancelPendingInput();
                }
            });
    }

    show(preserveFocus = false): void {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: "iJudge",
                pty: this.pty,
            });
        }

        this.terminal.show(preserveFocus);
    }

    write(text: string): void {
        this.writeEmitter.fire(text);
    }

    writeLine(text = ""): void {
        this.write(`${text}\r\n`);
    }

    async prompt(
        prompt: string,
        hidden = false
    ): Promise<string | undefined> {
        if (this.pendingInput) {
            throw new Error(
                "Another iJudge input prompt is already active."
            );
        }

        this.show(false);
        this.write(prompt);
        this.inputBuffer = "";

        return new Promise<string | undefined>((resolve) => {
            this.pendingInput = {
                resolve,
                hidden,
            };
        });
    }

    private handleInput(data: string): void {
        if (!this.pendingInput) {
            return;
        }

        // Ignore terminal escape sequences such as arrow keys.
        if (data.startsWith("\x1b")) {
            return;
        }

        for (const character of data) {
            if (!this.pendingInput) {
                break;
            }

            if (
                character === "\r" ||
                character === "\n"
            ) {
                this.finishInput();
                continue;
            }

            if (character === "\x03") {
                // Ctrl+C
                this.write("^C\r\n");
                this.cancelPendingInput();
                continue;
            }

            if (
                character === "\x7f" ||
                character === "\b"
            ) {
                this.handleBackspace();
                continue;
            }

            if (character >= " ") {
                this.inputBuffer += character;

                if (this.pendingInput.hidden) {
                    this.write("*");
                } else {
                    this.write(character);
                }
            }
        }
    }

    private handleBackspace(): void {
        if (
            !this.pendingInput ||
            this.inputBuffer.length === 0
        ) {
            return;
        }

        this.inputBuffer =
            this.inputBuffer.slice(0, -1);

        this.write("\b \b");
    }

    private finishInput(): void {
        if (!this.pendingInput) {
            return;
        }

        const pending = this.pendingInput;
        const value = this.inputBuffer;

        this.pendingInput = undefined;
        this.inputBuffer = "";

        this.write("\r\n");

        pending.resolve(value);
    }

    private cancelPendingInput(): void {
        if (!this.pendingInput) {
            return;
        }

        const pending = this.pendingInput;

        this.pendingInput = undefined;
        this.inputBuffer = "";

        pending.resolve(undefined);
    }

    dispose(): void {
        this.cancelPendingInput();

        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }

        this.closeSubscription.dispose();
        this.writeEmitter.dispose();
    }
}