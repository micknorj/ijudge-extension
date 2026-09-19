export interface TestcaseResult {
    testcaseId: number;
    result: string;
    execution: number | undefined;
}


export interface CodeQualityIssue {
    category: string;
    line: number;
    column: number;
    message: string;
}


export interface SubmissionResult {
    submissionId: number;
    result: string;
    score: number;
    qualityScore: number | undefined;
    qualityIssues: CodeQualityIssue[];
    records: TestcaseResult[];
}


interface QualityFields {
    report: string | undefined;
    score: number | undefined;
}


const MAX_SUBMISSION_REGION_CHARS =
    2 * 1024 * 1024;

const MAX_FLIGHT_STREAM_CHARS =
    8 * 1024 * 1024;

const MAX_QUALITY_REPORT_BYTES =
    256 * 1024;

const MAX_QUALITY_ISSUES =
    100;

const MAX_QUALITY_MESSAGE_CHARS =
    500;


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

    const quality =
        extractQualityFields(
            region
        );

    const qualityReport =
        extractQualityReport(
            source,
            quality.report
        );

    return {
        submissionId,
        result,
        score,

        qualityScore:
            quality.score,

        qualityIssues:
            qualityReport
                ? extractQualityIssues(
                    qualityReport
                )
                : [],

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


export function formatCodeQualityIssue(
    issue: CodeQualityIssue
): string {
    return (
        `Line ${issue.line}, ` +
        `column ${issue.column} ` +
        `(${issue.category}): ` +
        issue.message
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


function extractQualityReport(
    source: string,
    value: string | undefined
): string | undefined {
    if (!value) {
        return undefined;
    }

    const reference =
        /^\$([A-Za-z0-9]+)$/
            .exec(
                value
            )?.[1];

    if (!reference) {
        return value;
    }

    const flightStream =
        extractNextFlightStream(
            source
        );

    if (!flightStream) {
        return undefined;
    }

    const marker =
        new RegExp(
            `(?:^|\\n)${escapeRegExp(reference)}` +
            `:T([0-9A-Fa-f]+),`
        ).exec(
            flightStream
        );

    if (
        !marker ||
        marker.index ===
            undefined
    ) {
        return undefined;
    }

    const byteLength =
        Number.parseInt(
            marker[1],
            16
        );

    if (
        !Number.isSafeInteger(
            byteLength
        ) ||
        byteLength < 0 ||
        byteLength >
            MAX_QUALITY_REPORT_BYTES
    ) {
        return undefined;
    }

    return takeUtf8Bytes(
        flightStream,
        marker.index +
            marker[0].length,
        byteLength
    );
}


function extractNextFlightStream(
    source: string
): string | undefined {
    const fragments:
        string[] = [];

    let length =
        0;

    const pattern =
        /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;

    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        let fragment:
            string;

        try {
            fragment =
                JSON.parse(
                    match[1]
                ) as string;
        } catch {
            continue;
        }

        length +=
            fragment.length;

        if (
            length >
            MAX_FLIGHT_STREAM_CHARS
        ) {
            return undefined;
        }

        fragments.push(
            fragment
        );
    }

    return fragments.length > 0
        ? fragments.join(
            ""
        )
        : undefined;
}


function takeUtf8Bytes(
    source: string,
    start: number,
    byteLength: number
): string | undefined {
    if (
        byteLength === 0
    ) {
        return "";
    }

    const bytes =
        new TextEncoder()
            .encode(
                source.slice(
                    start
                )
            );

    if (
        bytes.length <
        byteLength
    ) {
        return undefined;
    }

    try {
        return new TextDecoder(
            "utf-8",
            {
                fatal:
                    true,
            }
        ).decode(
            bytes.subarray(
                0,
                byteLength
            )
        );
    } catch {
        return undefined;
    }
}


function extractQualityIssues(
    report: string
): CodeQualityIssue[] {
    const issues:
        CodeQualityIssue[] = [];

    const seen =
        new Set<string>();

    const pattern =
        /(?:^|\r?\n)([A-Z]):\s*(\d+),\s*(\d+):\s*([^\r\n]+)/g;

    for (
        const match
        of report.matchAll(
            pattern
        )
    ) {
        const line =
            Number(
                match[2]
            );

        const column =
            Number(
                match[3]
            );

        const message =
            match[4]
                .trim()
                .slice(
                    0,
                    MAX_QUALITY_MESSAGE_CHARS
                );

        if (
            !Number.isSafeInteger(
                line
            ) ||
            line < 1 ||
            !Number.isSafeInteger(
                column
            ) ||
            column < 0 ||
            !message
        ) {
            continue;
        }

        const category =
            match[1];

        const key =
            `${category}:${line}:${column}:${message}`;

        if (
            seen.has(
                key
            )
        ) {
            continue;
        }

        seen.add(
            key
        );

        issues.push({
            category,
            line,
            column,
            message,
        });

        if (
            issues.length >=
            MAX_QUALITY_ISSUES
        ) {
            break;
        }
    }

    return issues;
}


function extractQualityFields(
    source: string
): QualityFields {
    const pattern =
        /\\?"pep8\\?"\s*:\s*\\?"([^"\\]*)\\?"\s*,\s*\\?"pep8_score\\?"\s*:\s*(null|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g;

    let fields:
        QualityFields |
        undefined;

    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        const score =
            match[2] ===
                "null"
                ? undefined
                : Number(
                    match[2]
                );

        fields = {
            report:
                match[1],

            score:
                score !==
                    undefined &&
                Number.isFinite(
                    score
                )
                    ? score
                    : undefined,
        };
    }

    return fields || {
        report:
            undefined,

        score:
            extractNumberField(
                source,
                "pep8_score"
            ),
    };
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
