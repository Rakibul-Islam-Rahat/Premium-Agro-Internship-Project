import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import domainRoutes from "./routes/domain.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { broadcastSnapshotChanged } from "./modules/realtime.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.isProduction ? 1 : false);
app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: env.maxJsonBody }));
app.use(cookieParser());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({ success: true, data: { service: "premium-agro-backend", status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected", timestamp: new Date().toISOString() } });
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: "draft-8", legacyHeaders: false });
const authWithoutSnapshotMutation = new Set(["/auth/login", "/auth/verify", "/auth/refresh", "/auth/logout", "/auth/password-reset/request", "/auth/password-reset/confirm"]);
app.use("/api/v1", (req, res, next) => {
  const path = req.originalUrl.split("?")[0].replace(/^\/api\/v1/, "");
  const shouldBroadcast = !["GET", "HEAD", "OPTIONS"].includes(req.method) && !authWithoutSnapshotMutation.has(path);
  if (shouldBroadcast) {
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) broadcastSnapshotChanged();
    });
  }
  next();
});
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1", domainRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
