import {
    fetchRscPage,
} from "./client";


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
            await fetchRscPage(
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
        response.replace(
            /\\"/g,
            '"'
        );

    const courses:
        IJudgeCourse[] = [];

    const pattern =
        /"courseId":(\d+),"courseName":"((?:\\.|[^"\\])*)","enrolled":(true|false)/g;

    for (
        const match
        of source.matchAll(
            pattern
        )
    ) {
        const id =
            Number(
                match[1]
            );

        if (
            !Number.isSafeInteger(
                id
            ) ||
            courses.some(
                (course) =>
                    course.id === id
            )
        ) {
            continue;
        }

        courses.push({
            id,

            name:
                decodeJsonString(
                    match[2]
                ),

            enrolled:
                match[3] ===
                "true",
        });
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