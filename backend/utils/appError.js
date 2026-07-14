class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = "AppError";
        this.status = status;
    }
}

const createError = (message, status = 500) => new AppError(message, status);

module.exports = { AppError, createError };
