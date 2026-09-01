export interface TestcaseResult {
    testcaseId: number;
    result: string;
    execution: number | undefined;
}


export interface SubmissionResult {
    submissionId: number;
    result: string;
    score: number;
    qualityScore: number | undefined;
    records: TestcaseResult[];
}


const MAX_SUBMISSION_REGION_CHARS =
    2 * 1024 * 1024;


export function parseSubmissionResult(
    submissionId: number,
    source: string
): SubmissionResult | undefined {
    const region =
        findSubmissionRegion(
            source,
            submissionId
        );

    if (!region) {
        return undefined;
    }

    const result =
        extractStringField(
            region,
            "result"
        );

    if (
        !result ||
        result === "Judging"
    ) {
        return undefined;
    }

    const score =
        extractNumberField(
            region,
            "score"
        );

    if (
        score === undefined
    ) {
        return undefined;
    }

    const records =
        extractTestcaseRecords(
            region
        );

    if (
        records.length === 0
    ) {
        return undefined;
    }

    return {
        submissionId,
        result,
        score,

        qualityScore:
            extractNumberField(
                region,
                "pep8_score"
            ),

        records,
    };
}


export function determineSubmissionStatus(
    result: SubmissionResult
): "Passed" | "Not Passed" {
    return (
        result.records.length > 0 &&
        result.records.every(
            (record) =>
                record.result === "P"
        )
    )
        ? "Passed"
        : "Not Passed";
}


export function calculateQualityPercent(
    qualityScore: number
): number {
    return (
        Math.round(
            (
                (
                    qualityScore + 10
                ) /
                20 *
                100
            ) *
            100
        ) /
        100
    );
}


export function averageExecutionMs(
    result: SubmissionResult
): number | undefined {
    const executions =
        result.records
            .map(
                (record) =>
                    record.execution
            )
            .filter(
                (
                    value
                ): value is number =>
                    value !== undefined
            );

    if (
        executions.length === 0
    ) {
        return undefined;
    }

    const total =
        executions.reduce(
            (
                sum,
                execution
            ) =>
                sum + execution,
            0
        );

    return (
        total /
        executions.length *
        1000
    );
}


export function formatScore(
    score: number
): string {
    return new Intl.NumberFormat(
        "en-US",
        {
            maximumFractionDigits:
                3,
        }
    ).format(
        score
    );
}


export function testcaseResultName(
    code: string
): string {
    switch (code) {
        case "P":
            return "Passed";

        case "-":
            return "Incorrect";

        case "T":
            return "Timeout";

        case "R":
            return "Restrict/Require Word";

        default:
            return "Error";
    }
}


function findSubmissionRegion(
    source: string,
    submissionId: number
): string | undefined {
    const match =
        new RegExp(
            `\\\\?"cps_id\\\\?"` +
            `\\s*:\\s*${submissionId}` +
            `(?=\\s*[,}])`
        ).exec(
            source
        );

    if (
        !match ||
        match.index === undefined
    ) {
        return undefined;
    }

    return source.slice(
        match.index,
        match.index +
            MAX_SUBMISSION_REGION_CHARS
    );
}


function extractTestcaseRecords(
    source: string
): TestcaseResult[] {
    const records:
        TestcaseResult[] = [];

    const seen =
        new Set<number>();

    const pattern =
        /\\?"testcase_id\\?"\s*:\s*(\d+)\s*,\s*\\?"result\\?"\s*:\s*\\?"([^"\\]*)\\?"\s*,\s*\\?"execution\\?"\s*:\s*(null|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g;

    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        const testcaseId =
            Number(
                match[1]
            );

        if (
            !Number.isSafeInteger(
                testcaseId
            ) ||
            seen.has(
                testcaseId
            )
        ) {
            continue;
        }

        seen.add(
            testcaseId
        );

        const rawExecution =
            match[3];

        const parsedExecution =
            rawExecution === "null"
                ? undefined
                : Number(
                    rawExecution
                );

        records.push({
            testcaseId,

            result:
                match[2],

            execution:
                parsedExecution !==
                    undefined &&
                Number.isFinite(
                    parsedExecution
                )
                    ? parsedExecution
                    : undefined,
        });
    }

    return records.sort(
        (
            a,
            b
        ) =>
            a.testcaseId -
            b.testcaseId
    );
}


function extractStringField(
    source: string,
    field: string
): string | undefined {
    return source.match(
        new RegExp(
            `\\\\?"${escapeRegExp(field)}\\\\?"` +
            `\\s*:\\s*` +
            `\\\\?"([^"\\\\]*)\\\\?"`
        )
    )?.[1];
}


function extractNumberField(
    source: string,
    field: string
): number | undefined {
    const match =
        source.match(
            new RegExp(
                `\\\\?"${escapeRegExp(field)}\\\\?"` +
                `\\s*:\\s*` +
                `(null|[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`
            )
        );

    if (
        !match ||
        match[1] === "null"
    ) {
        return undefined;
    }

    const value =
        Number(
            match[1]
        );

    return Number.isFinite(
        value
    )
        ? value
        : undefined;
}


function escapeRegExp(
    value: string
): string {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}
