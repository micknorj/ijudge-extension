import {
    fetchRscPage,
} from "./client";


const COURSE_CACHE_TTL_MS =
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


let enrolledCourseCache:
    CourseCache | undefined;


export async function getEnrolledCourses(
    accessToken: string
): Promise<IJudgeCourse[]> {
    const now =
        Date.now();

    if (
        enrolledCourseCache &&
        enrolledCourseCache.expiresAt > now
    ) {
        return cloneCourses(
            enrolledCourseCache.courses
        );
    }

    const response =
        await fetchRscPage(
            "/courses",
            accessToken
        );

    const courses =
        parseCourses(
            response
        ).filter(
            (course) =>
                course.enrolled
        );

    enrolledCourseCache = {
        expiresAt:
            now +
            COURSE_CACHE_TTL_MS,

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
    enrolledCourseCache =
        undefined;
}


function parseCourses(
    response: string
): IJudgeCourse[] {
    const courses:
        IJudgeCourse[] = [];

    const pattern =
        /"courseId":(\d+),"courseName":"((?:\\.|[^"\\])*)","enrolled":(true|false)/g;

    for (
        const match
        of response.matchAll(
            pattern
        )
    ) {
        const id =
            Number(
                match[1]
            );

        const name =
            decodeJsonString(
                match[2]
            );

        const enrolled =
            match[3] ===
            "true";

        if (
            courses.some(
                (course) =>
                    course.id === id
            )
        ) {
            continue;
        }

        courses.push({
            id,
            name,
            enrolled,
        });
    }

    if (
        courses.length > 0
    ) {
        return courses;
    }

    /*
     * RSC responses can contain JSON whose quotation
     * marks are escaped inside another serialized layer.
     */
    const unescaped =
        response.replace(
            /\\"/g,
            '"'
        );

    if (
        unescaped !== response
    ) {
        return parseCourses(
            unescaped
        );
    }

    throw new Error(
        "Could not read the iJudge course list."
    );
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
