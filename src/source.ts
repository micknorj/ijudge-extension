export function detectProblemId(
    sourceCode: string
): number | undefined {
    if (!sourceCode) {
        return undefined;
    }

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
            .trim();

    if (!firstLine) {
        return undefined;
    }

    /*
     * """3155"""
     * '''3155'''
     */
    const tripleQuoteMatch =
        firstLine.match(
            /^(?:"""|''')\s*(\d+)\s*(?:"""|''')$/
        );

    if (tripleQuoteMatch) {
        return toProblemId(
            tripleQuoteMatch[1]
        );
    }

    /*
     * # 3155
     * # ijudge: 3155
     */
    const commentMatch =
        firstLine.match(
            /^#\s*(?:ijudge\s*:\s*)?(\d+)\s*$/i
        );

    if (commentMatch) {
        return toProblemId(
            commentMatch[1]
        );
    }

    return undefined;
}


function toProblemId(
    value: string
): number | undefined {
    const problemId =
        Number(value);

    if (
        !Number.isSafeInteger(
            problemId
        ) ||
        problemId <= 0
    ) {
        return undefined;
    }

    return problemId;
}
