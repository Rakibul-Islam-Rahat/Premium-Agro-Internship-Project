import mongoose from "mongoose";
import { env } from "../config/env.js";

export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, code: "ROUTE_NOT_FOUND", message: "API route not found." });
}

export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  let status = Number(error.status) || 500;
  let message = error.message || "An unexpected server error occurred.";
  let code = error.code || "INTERNAL_ERROR";

  if (error instanceof mongoose.Error.ValidationError) {
    status = 400; code = "VALIDATION_ERROR"; message = "One or more fields are invalid.";
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400; code = "INVALID_ID"; message = "A record identifier is invalid.";
  } else if (error?.code === 11000) {
    status = 409; code = "DUPLICATE_RECORD"; message = "A record with that value already exists.";
  } else if (error?.type === "entity.too.large") {
    status = 413; code = "PAYLOAD_TOO_LARGE"; message = "The submitted payload is too large. Reduce the file size and try again.";
  }

  if (status >= 500) {
    console.error(error);
    message = env.isProduction ? "An unexpected server error occurred." : message;
  }
  res.status(status).json({ success: false, code, message });
}
