export function normalizeNextPayload(
    source: string
): string {
    const parts = [
        source,
    ];

    const nextFlightPattern =
        /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;

    for (
        const match
        of source.matchAll(
            nextFlightPattern
        )
    ) {
        try {
            parts.push(
                JSON.parse(
                    match[1]
                ) as string
            );
        } catch {
            // Keep scanning other payload fragments.
        }
    }

    parts.push(
        source
            .replace(
                /\\u0022/gi,
                '"'
            )
            .replace(
                /\\"/g,
                '"'
            )
    );

    return parts.join(
        "\n"
    );
}


export function findFlatObjects(
    source: string,
    markerField: string
): string[] {
    const pattern =
        new RegExp(
            `"${escapeRegExp(markerField)}"\\s*:`,
            "g"
        );

    const objects:
        string[] = [];

    const seen =
        new Set<string>();

    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        if (
            match.index ===
            undefined
        ) {
            continue;
        }

        const start =
            source.lastIndexOf(
                "{",
                match.index
            );

        const end =
            source.indexOf(
                "}",
                match.index
            );

        if (
            start < 0 ||
            end < 0 ||
            end <= start
        ) {
            continue;
        }

        const key =
            `${start}:${end}`;

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

        objects.push(
            source.slice(
                start,
                end + 1
            )
        );
    }

    return objects;
}


export function getStringField(
    source: string,
    field: string
): string | undefined {
    const match =
        source.match(
            new RegExp(
                `"${escapeRegExp(field)}"` +
                `\\s*:\\s*` +
                `"((?:\\\\.|[^"\\\\])*)"`
            )
        );

    if (!match) {
        return undefined;
    }

    try {
        return JSON.parse(
            `"${match[1]}"`
        ) as string;
    } catch {
        return match[1];
    }
}


export function getNumberField(
    source: string,
    field: string
): number | undefined {
    const raw =
        source.match(
            new RegExp(
                `"${escapeRegExp(field)}"` +
                `\\s*:\\s*` +
                `([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`
            )
        )?.[1];

    if (!raw) {
        return undefined;
    }

    const value =
        Number(
            raw
        );

    return Number.isFinite(
        value
    )
        ? value
        : undefined;
}


export function getBooleanField(
    source: string,
    field: string
): boolean | undefined {
    const raw =
        source.match(
            new RegExp(
                `"${escapeRegExp(field)}"` +
                `\\s*:\\s*` +
                `(true|false)`
            )
        )?.[1];

    if (!raw) {
        return undefined;
    }

    return raw ===
        "true";
}


function escapeRegExp(
    value: string
): string {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}
