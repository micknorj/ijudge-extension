import {
    fetchAuthenticatedPage,
} from "./client";

import {
    IJudgeCourse,
} from "./courses";

import {
    findFlatObjects,
    getBooleanField,
    getNumberField,
    getStringField,
    normalizeNextPayload,
} from "./payload";


const CACHE_TTL_MS =
    60_000;


export interface IJudgeProblem {
    id: number;
    title: string;
    language: string;
    releaseTime: Date;
    expireTime: Date;
    submitDisabled: boolean;
}


export interface CourseProblems {
    isExam: boolean;
    problems: IJudgeProblem[];
}


export interface AssignmentMatch {
    course: IJudgeCourse;
    problem: IJudgeProblem;
}


interface CacheEntry {
    expiresAt: number;
    data: CourseProblems;
}


const cache =
    new Map<
        number,
        CacheEntry
    >();


export async function findAssignment(
    problemId: number,
    courses: IJudgeCourse[],
    accessToken: string
): Promise<AssignmentMatch | undefined> {
    for (
        const course
        of courses
    ) {
        if (
            looksLikeExam(
                course.name
            )
        ) {
            continue;
        }

        const data =
            await getCourseProblems(
                course.id,
                accessToken
            );

        if (
            data.isExam
        ) {
            continue;
        }

        const problem =
            data.problems.find(
                (item) =>
                    item.id ===
                    problemId
            );

        if (problem) {
            return {
                course: {
                    ...course,
                },

                problem:
                    cloneProblem(
                        problem
                    ),
            };
        }
    }

    return undefined;
}


export function validateAssignment(
    problem: IJudgeProblem
): string | undefined {
    if (
        looksLikeExam(
            problem.title
        )
    ) {
        return (
            "Exam-labelled assignments are not supported by automatic submission."
        );
    }

    if (
        problem.language
            .toLowerCase() !==
        "python"
    ) {
        return (
            `This assignment requires ${problem.language}, not Python.`
        );
    }

    if (
        problem.submitDisabled
    ) {
        return (
            "Submission is disabled for this assignment."
        );
    }

    const now =
        Date.now();

    if (
        now <
        problem.releaseTime.getTime()
    ) {
        return (
            "This assignment has not been released yet."
        );
    }

    if (
        now >
        problem.expireTime.getTime()
    ) {
        return (
            "This assignment is no longer accepting submissions."
        );
    }

    return undefined;
}


export function clearProblemCache():
    void {
    cache.clear();
}


export function parseCourseProblemsResponse(
    response: string,
    expectedCourseId: number
): CourseProblems {
    const source =
        normalizeNextPayload(
            response
        );

    const courseIdMatches =
        source.matchAll(
            /"courseId"\s*:\s*(\d+)/g
        );

    let expectedCourseFound =
        false;

    for (
        const match
        of courseIdMatches
    ) {
        if (
            Number(
                match[1]
            ) ===
            expectedCourseId
        ) {
            expectedCourseFound =
                true;

            break;
        }
    }

    const isExam =
        getBooleanField(
            source,
            "isExam"
        );

    if (
        !expectedCourseFound ||
        isExam === undefined
    ) {
        throw new Error(
            "Could not read the iJudge problem list."
        );
    }

    const problems:
        IJudgeProblem[] = [];

    const seen =
        new Set<number>();

    for (
        const object
        of findFlatObjects(
            source,
            "cp_id"
        )
    ) {
        const id =
            getNumberField(
                object,
                "cp_id"
            );

        const title =
            getStringField(
                object,
                "cp_title"
            );

        const release =
            getStringField(
                object,
                "cp_release_time"
            );

        const expire =
            getStringField(
                object,
                "cp_expired_time"
            );

        const language =
            getStringField(
                object,
                "cp_lang_type"
            );

        const disabledNumber =
            getNumberField(
                object,
                "cp_is_disable_submit"
            );

        const disabledBoolean =
            getBooleanField(
                object,
                "cp_is_disable_submit"
            );

        if (
            id === undefined ||
            !Number.isSafeInteger(
                id
            ) ||
            id <= 0 ||
            !title ||
            !release ||
            !expire ||
            !language ||
            (
                disabledNumber ===
                    undefined &&
                disabledBoolean ===
                    undefined
            ) ||
            seen.has(
                id
            )
        ) {
            continue;
        }

        const releaseTime =
            new Date(
                release
            );

        const expireTime =
            new Date(
                expire
            );

        if (
            Number.isNaN(
                releaseTime.getTime()
            ) ||
            Number.isNaN(
                expireTime.getTime()
            )
        ) {
            continue;
        }

        seen.add(
            id
        );

        problems.push({
            id,
            title,
            language,
            releaseTime,
            expireTime,

            submitDisabled:
                disabledBoolean ??
                disabledNumber !== 0,
        });
    }

    return {
        isExam,
        problems,
    };
}


async function getCourseProblems(
    courseId: number,
    accessToken: string
): Promise<CourseProblems> {
    const cached =
        cache.get(
            courseId
        );

    if (
        cached &&
        cached.expiresAt >
        Date.now()
    ) {
        return cloneCourseProblems(
            cached.data
        );
    }

    const data =
        parseCourseProblemsResponse(
            await fetchAuthenticatedPage(
                `/courses/${courseId}/problems`,
                accessToken
            ),
            courseId
        );

    cache.set(
        courseId,
        {
            expiresAt:
                Date.now() +
                CACHE_TTL_MS,

            data:
                cloneCourseProblems(
                    data
                ),
        }
    );

    return cloneCourseProblems(
        data
    );
}


function cloneCourseProblems(
    data: CourseProblems
): CourseProblems {
    return {
        isExam:
            data.isExam,

        problems:
            data.problems.map(
                cloneProblem
            ),
    };
}


function cloneProblem(
    problem: IJudgeProblem
): IJudgeProblem {
    return {
        ...problem,

        releaseTime:
            new Date(
                problem.releaseTime
            ),

        expireTime:
            new Date(
                problem.expireTime
            ),
    };
}


function looksLikeExam(
    value: string
): boolean {
    return (
        /\b(midterm|final|exam|examination)\b/i
            .test(
                value
            )
    );
}
