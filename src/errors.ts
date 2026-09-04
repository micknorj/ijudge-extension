export class SessionExpiredError extends Error {
    constructor(
        message = "Your iJudge session has expired."
    ) {
        super(message);
        this.name = "SessionExpiredError";
    }
}


export type IJudgeCompatibilityErrorCode =
    | "ACTION_NOT_FOUND"
    | "ACTION_AMBIGUOUS"
    | "ACTION_SCAN_INCOMPLETE"
    | "COURSE_DATA_UNRECOGNIZED"
    | "PROBLEM_DATA_UNRECOGNIZED"
    | "RESULT_DATA_UNRECOGNIZED";


export class IJudgeCompatibilityError extends Error {
    readonly code:
        IJudgeCompatibilityErrorCode;

    constructor(
        code: IJudgeCompatibilityErrorCode,
        message: string
    ) {
        super(message);

        this.name =
            "IJudgeCompatibilityError";

        this.code =
            code;
    }
}
