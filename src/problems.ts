import {
    fetchRscPage,
} from "./client";

import {
    IJudgeCourse,
} from "./courses";


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
        response.replace(
            /\\"/g,
            '"'
        );

    const courseId =
        Number(
            source.match(
                /"courseId":(\d+)/
            )?.[1]
        );

    const examMatch =
        source.match(
            /"isExam":(true|false)/
        );

    if (
        courseId !==
            expectedCourseId ||
        !examMatch
    ) {
        throw new Error(
            "Could not read the iJudge problem list."
        );
    }

    const problems:
        IJudgeProblem[] = [];

    const pattern =
        /\{"cp_id":(\d+),"cp_problem_id":\d+,"cp_title":"((?:\\.|[^"\\])*)","cp_submission_limit":\d+,"cp_release_time":"([^"]+)","cp_expired_time":"([^"]+)","cp_lang_type":"([^"]+)"[^{}]*?"cp_is_disable_submit":(\d+)/g;

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

        const releaseTime =
            new Date(
                match[3]
            );

        const expireTime =
            new Date(
                match[4]
            );

        if (
            !Number.isSafeInteger(
                id
            ) ||
            id <= 0 ||
            Number.isNaN(
                releaseTime.getTime()
            ) ||
            Number.isNaN(
                expireTime.getTime()
            )
        ) {
            continue;
        }

        problems.push({
            id,

            title:
                decodeJsonString(
                    match[2]
                ),

            language:
                decodeJsonString(
                    match[5]
                ),

            releaseTime,
            expireTime,

            submitDisabled:
                Number(
                    match[6]
                ) !== 0,
        });
    }

    return {
        isExam:
            examMatch[1] ===
            "true",

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
            await fetchRscPage(
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