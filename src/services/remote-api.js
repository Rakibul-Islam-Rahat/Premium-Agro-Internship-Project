import { http } from "./http.js";
import { refreshRemoteSnapshot } from "./remote-store.js";

const unpack = (response) => response?.data?.data ?? response?.data ?? response;
const payload = (request, { refresh = true } = {}) => request.then(async (response) => {
  const result = unpack(response);
  if (refresh) {
    try {
      await refreshRemoteSnapshot();
    } catch (error) {
      // The server write already succeeded. Don't report a false write failure just
      // because the follow-up snapshot request had a transient network error.
      if (import.meta.env.DEV) console.warn("Write succeeded but the latest Premium Agro snapshot could not be refreshed:", error.message);
    }
  }
  return result;
});
const post = (url, body = {}) => payload(http.post(url, body));
const patch = (url, body = {}) => payload(http.patch(url, body));
const remove = (url) => payload(http.delete(url));
const unsupported = (message) => Promise.reject(new Error(message));

// The backend derives the actor/user identity from the authenticated access token.
// The legacy actorId/userId parameters remain only for component compatibility.
export const remoteApi = {
  invest: async () => unsupported("Direct investments are disabled. Submit an amount-based request for the single collective programme first."),
  createInvestmentRequest: (_userId, projectId, amount) => post("/investment-requests", { projectId, amount }),
  reviewInvestmentRequest: (_actorId, requestId, approve) => post(`/investment-requests/${encodeURIComponent(requestId)}/review`, { approve }),
  submitInvestmentPayment: (_userId, requestId, data) => post(`/investment-requests/${encodeURIComponent(requestId)}/payment`, data),
  reviewInvestmentPayment: (_actorId, requestId, approve) => post(`/investment-requests/${encodeURIComponent(requestId)}/payment-review`, { approve }),
  cancelInvestmentRequest: (_userId, requestId) => post(`/investment-requests/${encodeURIComponent(requestId)}/cancel`),
  investDirect: async () => unsupported("Direct investment payments are disabled. Submit a request, wait for approval, then use the verified bank details."),
  reviewProjectPayment: async () => unsupported("Legacy direct-payment review is disabled. Use Payment Review for approved investment requests."),
  requestDeposit: async () => unsupported("Direct wallet deposits are disabled. Submit an investment request and pay only after approval."),
  requestWithdraw: (_userId, data) => post("/wallet/withdrawals", data),
  reviewTx: (_actorId, txId, approve) => post(`/wallet/transactions/${encodeURIComponent(txId)}/review`, { approve }),
  submitKyc: (_userId, data) => post("/kyc", data),
  reviewKyc: (_actorId, targetUserId, approve) => post(`/kyc/${encodeURIComponent(targetUserId)}/review`, { approve }),
  updateProfile: (_userId, fields) => patch("/profile", fields),
  updateProgram: (_actorId, data) => patch("/programme", data),
  createAgroProject: (_actorId, data) => post("/admin/agro-projects", data),
  updateAgroProject: (_actorId, projectId, data) => patch(`/admin/agro-projects/${encodeURIComponent(projectId)}`, data),
  deleteAgroProject: (_actorId, projectId) => remove(`/admin/agro-projects/${encodeURIComponent(projectId)}`),
  archiveAgroProject: (_actorId, projectId) => post(`/admin/agro-projects/${encodeURIComponent(projectId)}/archive`),
  setAgroProjectStatus: (_actorId, projectId, status) => patch(`/admin/agro-projects/${encodeURIComponent(projectId)}/status`, { status }),
  setAgroProjectProgress: (_actorId, projectId, data) => patch(`/admin/agro-projects/${encodeURIComponent(projectId)}/progress`, data),
  requestProjectFunding: (_actorId, projectId, amount, note) => post("/admin/project-funding", { projectId, amount, note }),
  reviewProjectFunding: (_actorId, allocationId, approve, reviewNote = "") => post(`/admin/project-funding/${encodeURIComponent(allocationId)}/review`, { approve, reviewNote }),
  createProject: async () => unsupported("Use the underlying project manager; investors still invest through the single pooled programme."),
  setProgramStatus: (_actorId, projectId, status) => patch("/programme/status", { projectId, status }),
  setProjectStatus: (_actorId, projectId, status) => patch("/programme/status", { projectId, status }),
  setProjectProgress: (_actorId, projectId, data) => patch("/programme/progress", { projectId, ...data }),
  addFieldLog: (_actorId, data) => post("/field-logs", data),
  reviewFieldLog: (_actorId, logId, approve) => post(`/field-logs/${encodeURIComponent(logId)}/review`, { approve }),
  createUser: (_actorId, data) => post("/admin/users", data),
  registerAccount: async (data) => post("/auth/register", data),
  reviewAccountRegistration: (_actorId, userId, approve) => post(`/admin/registrations/${encodeURIComponent(userId)}/review`, { approve }),
  setAccountStatus: (_actorId, userId, status) => patch(`/admin/users/${encodeURIComponent(userId)}/status`, { status }),
  setRole: (_actorId, userId, role) => patch(`/admin/users/${encodeURIComponent(userId)}/role`, { role }),
  markRead: () => post("/notifications/read"),
  sendSupportMessage: (_userId, text) => post("/support/messages", { text }),
  replySupportMessage: (_actorId, threadId, text) => post(`/support/${encodeURIComponent(threadId)}/reply`, { text }),
  markSupportThreadRead: (_actorId, threadId) => post(`/support/${encodeURIComponent(threadId)}/read`),
  uploadLegalDocument: (_actorId, data) => post("/admin/documents", data),
  deleteLegalDocument: (_actorId, documentId) => remove(`/admin/documents/${encodeURIComponent(documentId)}`),
  createFinancialEntry: (_actorId, data) => post("/admin/financial-entries", data),
  reviewFinancialEntry: (_actorId, entryId, approve, reviewNote = "") => post(`/admin/financial-entries/${encodeURIComponent(entryId)}/review`, { approve, reviewNote }),
  allocate: (_actorId, input) => post("/admin/allocations", input),
  previewAllocationRemote: (_actorId, input) => payload(http.post("/admin/allocations/preview", input), { refresh: false }),
};
