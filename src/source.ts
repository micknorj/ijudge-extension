export function detectProblemId(
    sourceCode: string
): number | undefined {
    const firstLine =
        sourceCode
            .replace(
                /^\uFEFF/,
                ""
            )
            .split(
                /\r?\n/,
                1
            )[0]
            ?.trim();

    if (!firstLine) {
        return undefined;
    }

    const match =
        firstLine.match(
            /^(?:"""|''')\s*(\d+)\s*(?:"""|''')$/
        ) ??
        firstLine.match(
            /^#\s*(?:ijudge\s*:\s*)?(\d+)\s*$/i
        );

    if (!match) {
        return undefined;
    }

    const id =
        Number(
            match[1]
        );

    return (
        Number.isSafeInteger(
            id
        ) &&
        id > 0
    )
        ? id
        : undefined;
}