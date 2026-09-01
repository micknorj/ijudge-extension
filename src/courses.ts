import {
    fetchAuthenticatedPage,
} from "./client";

import {
    findFlatObjects,
    getBooleanField,
    getNumberField,
    getStringField,
    normalizeNextPayload,
} from "./payload";


const CACHE_TTL_MS =
    60_000;


export interface IJudgeCourse {
    id: number;
    name: string;
    enrolled: boolean;
}


interface CourseCache {
    expiresAt: number;
    courses: IJudgeCourse[];
}


let cache:
    CourseCache | undefined;


export async function getEnrolledCourses(
    accessToken: string
): Promise<IJudgeCourse[]> {
    if (
        cache &&
        cache.expiresAt >
        Date.now()
    ) {
        return cloneCourses(
            cache.courses
        );
    }

    const courses =
        parseCoursesResponse(
            await fetchAuthenticatedPage(
                "/courses",
                accessToken
            )
        ).filter(
            (course) =>
                course.enrolled
        );

    cache = {
        expiresAt:
            Date.now() +
            CACHE_TTL_MS,

        courses:
            cloneCourses(
                courses
            ),
    };

    return cloneCourses(
        courses
    );
}


export function clearCourseCache():
    void {
    cache =
        undefined;
}


export function parseCoursesResponse(
    response: string
): IJudgeCourse[] {
    const source =
        normalizeNextPayload(
            response
        );

    const courses:
        IJudgeCourse[] = [];

    const seen =
        new Set<number>();

    for (
        const object
        of findFlatObjects(
            source,
            "courseId"
        )
    ) {
        addCourse(
            courses,
            seen,
            getNumberField(
                object,
                "courseId"
            ),
            getStringField(
                object,
                "courseName"
            ),
            getBooleanField(
                object,
                "enrolled"
            )
        );
    }

    if (
        courses.length === 0
    ) {
        const pattern =
            /"courseId"\s*:\s*(\d+)\s*,\s*"courseName"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"enrolled"\s*:\s*(true|false)/g;

        for (
            const match
            of source.matchAll(
                pattern
            )
        ) {
            addCourse(
                courses,
                seen,
                Number(
                    match[1]
                ),
                decodeJsonString(
                    match[2]
                ),
                match[3] ===
                    "true"
            );
        }
    }

    if (
        courses.length === 0
    ) {
        throw new Error(
            "Could not read the iJudge course list."
        );
    }

    return courses;
}


function addCourse(
    courses: IJudgeCourse[],
    seen: Set<number>,
    id: number | undefined,
    name: string | undefined,
    enrolled: boolean | undefined
): void {
    if (
        id === undefined ||
        !Number.isSafeInteger(
            id
        ) ||
        id <= 0 ||
        !name ||
        enrolled === undefined ||
        seen.has(
            id
        )
    ) {
        return;
    }

    seen.add(
        id
    );

    courses.push({
        id,
        name,
        enrolled,
    });
}


function cloneCourses(
    courses: IJudgeCourse[]
): IJudgeCourse[] {
    return courses.map(
        (course) => ({
            ...course,
        })
    );
}


function decodeJsonString(
    value: string
): string {
    try {
        return JSON.parse(
            `"${value}"`
        ) as string;
    } catch {
        return value;
    }
}
