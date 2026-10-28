import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { asyncHandler, sendData } from "../utils/errors.js";
import * as auth from "../modules/auth.service.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many authentication attempts. Please try again later." } });

router.post("/register", loginLimiter, asyncHandler(async (req, res) => sendData(res, await auth.register(req.body), 201)));
router.post("/login", loginLimiter, asyncHandler(async (req, res) => sendData(res, await auth.login(req.body, res))));
router.post("/verify", loginLimiter, asyncHandler(async (req, res) => sendData(res, await auth.verifyLogin(req.body, res))));
router.post("/refresh", asyncHandler(async (req, res) => sendData(res, await auth.refreshSession(req, res))));
router.post("/logout", asyncHandler(async (req, res) => sendData(res, await auth.logout(req, res))));
router.post("/password-reset/request", loginLimiter, asyncHandler(async (req, res) => sendData(res, await auth.requestPasswordReset(req.body))));
router.post("/password-reset/confirm", loginLimiter, asyncHandler(async (req, res) => sendData(res, await auth.resetPassword(req.body))));

export default router;
