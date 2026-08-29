export class SessionExpiredError extends Error {
    constructor(
        message =
            "Your iJudge session has expired."
    ) {
        super(message);

        this.name =
            "SessionExpiredError";
    }
}
