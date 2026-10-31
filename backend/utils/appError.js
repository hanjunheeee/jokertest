class AppError extends Error {
    constructor(message, status = 500, code) {
        super(message);
        this.name = "AppError";
        this.status = status;
        if (code) this.code = code;
    }
}

const createError = (message, status = 500, code) => new AppError(message, status, code);

module.exports = { AppError, createError };
