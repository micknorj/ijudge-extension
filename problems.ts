import {
    fetchRscPage,
} from "./client";

import {
    IJudgeCourse,
} from "./courses";


const PROBLEM_CACHE_TTL_MS =
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
    courseId: number;
    isExam: boolean;
    problems: IJudgeProblem[];
}


export interface AssignmentMatch {
    course: IJudgeCourse;
    problem: IJudgeProblem;
}


interface ProblemCacheEntry {
    expiresAt: number;
    courseProblems: CourseProblems;
}


const problemCache =
    new Map<
        number,
        ProblemCacheEntry
    >();


export async function findAssignment(
    problemId: number,
    courses: IJudgeCourse[],
    accessToken: string,
    onStatus?: (
        message: string
    ) => void
): Promise<AssignmentMatch | undefined> {
    const candidates =
        courses.filter(
            (course) =>
                !looksLikeExam(
                    course.name
                )
        );

    for (
        const course
        of candidates
    ) {
        onStatus?.(
            `Checking ${course.name}...`
        );

        const courseProblems =
            await getCourseProblems(
                course.id,
                accessToken
            );

        if (
            courseProblems.isExam
        ) {
            onStatus?.(
                `Skipping exam course: ${course.name}`
            );

            continue;
        }

        const problem =
            courseProblems.problems.find(
                (item) =>
                    item.id === problemId
            );

        if (!problem) {
            continue;
        }

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

    return undefined;
}


export function validateAssignment(
    problem: IJudgeProblem
): string | undefined {
    /*
     * Exam-labelled problems may exist inside an
     * otherwise normal course.
     */
    if (
        looksLikeExam(
            problem.title
        )
    ) {
        return (
            "Exam-labelled assignments are not " +
            "supported by automatic submission."
        );
    }

    if (
        problem.language
            .toLowerCase() !==
        "python"
    ) {
        return (
            `This assignment requires ` +
            `${problem.language}, not Python.`
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
        new Date();

    if (
        now <
        problem.releaseTime
    ) {
        return (
            "This assignment has not been released yet."
        );
    }

    if (
        now >
        problem.expireTime
    ) {
        return (
            "This assignment is no longer accepting submissions."
        );
    }

    return undefined;
}


export function clearProblemCache():
    void {
    problemCache.clear();
}


async function getCourseProblems(
    courseId: number,
    accessToken: string
): Promise<CourseProblems> {
    const now =
        Date.now();

    const cached =
        problemCache.get(
            courseId
        );

    if (
        cached &&
        cached.expiresAt > now
    ) {
        return cloneCourseProblems(
            cached.courseProblems
        );
    }

    const response =
        await fetchRscPage(
            `/courses/${courseId}/problems`,
            accessToken
        );

    const courseProblems =
        parseCourseProblems(
            response
        );

    problemCache.set(
        courseId,
        {
            expiresAt:
                now +
                PROBLEM_CACHE_TTL_MS,

            courseProblems:
                cloneCourseProblems(
                    courseProblems
                ),
        }
    );

    return cloneCourseProblems(
        courseProblems
    );
}


function parseCourseProblems(
    response: string
): CourseProblems {
    const normalized =
        response.replace(
            /\\"/g,
            '"'
        );

    const courseIdMatch =
        normalized.match(
            /"courseId":(\d+)/
        );

    const isExamMatch =
        normalized.match(
            /"isExam":(true|false)/
        );

    if (
        !courseIdMatch ||
        !isExamMatch
    ) {
        throw new Error(
            "Could not read the iJudge problem list."
        );
    }

    const problems:
        IJudgeProblem[] = [];

    const problemPattern =
        /\{"cp_id":(\d+),"cp_problem_id":\d+,"cp_title":"((?:\\.|[^"\\])*)","cp_submission_limit":\d+,"cp_release_time":"([^"]+)","cp_expired_time":"([^"]+)","cp_lang_type":"([^"]+)".*?"cp_is_disable_submit":(\d+)/gs;

    for (
        const match
        of normalized.matchAll(
            problemPattern
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
        courseId:
            Number(
                courseIdMatch[1]
            ),

        isExam:
            isExamMatch[1] ===
            "true",

        problems,
    };
}


function cloneCourseProblems(
    value: CourseProblems
): CourseProblems {
    return {
        courseId:
            value.courseId,

        isExam:
            value.isExam,

        problems:
            value.problems.map(
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