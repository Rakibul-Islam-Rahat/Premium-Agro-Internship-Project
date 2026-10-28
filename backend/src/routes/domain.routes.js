import { Router } from "express";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { asyncHandler, badRequest, sendData } from "../utils/errors.js";
import * as domain from "../modules/domain.service.js";
import mongoose from "mongoose";
import { subscribeToSnapshotEvents } from "../modules/realtime.js";

const router = Router();
router.use(authRequired);

// Never coerce untrusted request values: Boolean("false") is true in JavaScript.
const approvalDecision = (body) => {
  if (typeof body?.approve !== "boolean") throw badRequest("The approve field must be a boolean true or false.");
  return body.approve;
};

router.get("/events", asyncHandler(async (req, res) => { subscribeToSnapshotEvents(res, req.user); }));

// Role-scoped snapshot is the single source of persisted application data for the UI.
router.get("/app/snapshot", asyncHandler(async (req, res) => sendData(res, await domain.getSnapshot(req.user))));

router.post("/investment-requests", asyncHandler(async (req, res) => sendData(res, await domain.createInvestmentRequest(req.user, req.body), 201)));
router.post("/investment-requests/:id/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewInvestmentRequest(req.user, req.params.id, approvalDecision(req.body)))));
router.post("/investment-requests/:id/payment", asyncHandler(async (req, res) => sendData(res, await domain.submitInvestmentPayment(req.user, req.params.id, req.body))));
router.post("/investment-requests/:id/payment-review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewInvestmentPayment(req.user, req.params.id, approvalDecision(req.body)))));
router.post("/investment-requests/:id/cancel", asyncHandler(async (req, res) => sendData(res, await domain.cancelInvestmentRequest(req.user, req.params.id))));

router.post("/wallet/withdrawals", asyncHandler(async (req, res) => sendData(res, await domain.requestWithdrawal(req.user, req.body), 201)));
router.post("/wallet/transactions/:id/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewTransaction(req.user, req.params.id, approvalDecision(req.body)))));

router.post("/kyc", asyncHandler(async (req, res) => sendData(res, await domain.submitKyc(req.user, req.body))));
router.post("/kyc/:userId/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewKyc(req.user, req.params.userId, approvalDecision(req.body)))));
router.patch("/profile", asyncHandler(async (req, res) => sendData(res, await domain.updateProfile(req.user, req.body))));

router.patch("/programme", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.updateProgramme(req.user, req.body))));
router.patch("/programme/status", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setProgrammeStatus(req.user, req.body.projectId, req.body.status))));
router.patch("/programme/progress", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setProgrammeProgress(req.user, req.body.projectId, req.body))));

// Underlying operational projects belong to the one pooled investment programme.
router.post("/admin/agro-projects", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.createAgroProject(req.user, req.body), 201)));
router.patch("/admin/agro-projects/:id", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.updateAgroProject(req.user, req.params.id, req.body))));
router.patch("/admin/agro-projects/:id/status", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setAgroProjectStatus(req.user, req.params.id, req.body.status))));
router.patch("/admin/agro-projects/:id/progress", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setAgroProjectProgress(req.user, req.params.id, req.body))));
router.delete("/admin/agro-projects/:id", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.deleteAgroProject(req.user, req.params.id))));
router.post("/admin/agro-projects/:id/archive", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.archiveAgroProject(req.user, req.params.id))));
router.post("/admin/project-funding", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.requestProjectFunding(req.user, req.body), 201)));
router.post("/admin/project-funding/:id/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewProjectFunding(req.user, req.params.id, approvalDecision(req.body), req.body.reviewNote))));

router.post("/field-logs", requireRoles("FIELD_MGR"), asyncHandler(async (req, res) => sendData(res, await domain.addFieldLog(req.user, req.body), 201)));
router.post("/field-logs/:id/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewFieldLog(req.user, req.params.id, approvalDecision(req.body)))));

router.post("/admin/users", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.createUser(req.user, req.body), 201)));
router.post("/admin/registrations/:userId/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewRegistration(req.user, req.params.userId, approvalDecision(req.body)))));
router.patch("/admin/users/:userId/status", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setAccountStatus(req.user, req.params.userId, req.body.status))));
router.patch("/admin/users/:userId/role", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.setRole(req.user, req.params.userId, req.body.role))));

router.post("/notifications/read", asyncHandler(async (req, res) => sendData(res, await domain.markNotificationsRead(req.user))));
router.post("/support/messages", asyncHandler(async (req, res) => sendData(res, await domain.sendSupportMessage(req.user, req.body.text), 201)));
router.post("/support/:threadId/reply", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.replySupportMessage(req.user, req.params.threadId, req.body.text), 201)));
router.post("/support/:threadId/read", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.markSupportThreadRead(req.user, req.params.threadId))));

router.post("/admin/documents", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.uploadLegalDocument(req.user, req.body), 201)));
router.delete("/admin/documents/:id", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.deleteLegalDocument(req.user, req.params.id))));

router.post("/admin/financial-entries", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.createFinancialEntry(req.user, req.body), 201)));
router.post("/admin/financial-entries/:id/review", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.reviewFinancialEntry(req.user, req.params.id, approvalDecision(req.body), req.body.reviewNote))));
router.post("/admin/allocations/preview", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.previewProceeds(req.user, req.body))));
router.post("/admin/allocations", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (req, res) => sendData(res, await domain.allocateProceeds(req.user, req.body))));

router.get("/admin/system/health", requireRoles("ADMIN", "MAIN_ADMIN"), asyncHandler(async (_req, res) => sendData(res, { database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" })));

export default router;
