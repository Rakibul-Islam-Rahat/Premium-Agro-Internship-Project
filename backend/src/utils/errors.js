export class AppError extends Error {
  constructor(status, message, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new AppError(400, message, "BAD_REQUEST");
export const unauthorized = (message = "Please sign in again.") => new AppError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "You do not have permission to perform this action.") => new AppError(403, message, "FORBIDDEN");
export const notFound = (message = "The requested record was not found.") => new AppError(404, message, "NOT_FOUND");
export const conflict = (message) => new AppError(409, message, "CONFLICT");
export const unavailable = (message) => new AppError(503, message, "SERVICE_UNAVAILABLE");

export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function sendData(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
