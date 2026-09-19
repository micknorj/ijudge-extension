export interface TerminalField {
    label: string;
    value: string;
}


export type TerminalSectionRow =
    string |
    TerminalField;


export function formatTerminalSection(
    title: string,
    rows: readonly TerminalSectionRow[] = []
): string[] {
    const safeTitle =
        sanitizeTerminalText(
            title
        ) ||
        "iJudge";

    const safeRows =
        rows.map(
            (
                row
            ) =>
                typeof row ===
                    "string"
                    ? sanitizeTerminalText(
                        row
                    )
                    : {
                        label:
                            sanitizeTerminalText(
                                row.label
                            ),

                        value:
                            sanitizeTerminalText(
                                row.value
                            ),
                    }
        );

    const labelWidth =
        safeRows.reduce(
            (
                width,
                row
            ) =>
                typeof row ===
                    "string"
                    ? width
                    : Math.max(
                        width,
                        row.label.length +
                            1
                    ),
            0
        );

    return [
        safeTitle,
        "-".repeat(
            safeTitle.length
        ),

        ...safeRows.map(
            (
                row
            ) => {
                if (
                    typeof row ===
                    "string"
                ) {
                    return row;
                }

                const label =
                    `${row.label}:`;

                return (
                    label.padEnd(
                        labelWidth,
                        " "
                    ) +
                    (
                        row.value
                            ? ` ${row.value}`
                            : ""
                    )
                );
            }
        ),
    ];
}


export function sanitizeTerminalText(
    value: string
): string {
    return value
        .replace(
            /\u001b\[[0-?]*[ -/]*[@-~]/g,
            ""
        )
        .replace(
            /[\u0000-\u001f\u007f-\u009f]+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}
