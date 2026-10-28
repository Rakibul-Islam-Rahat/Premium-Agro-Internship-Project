export const CATEGORY = { COLLECTIVE: "Pooled Programme", CATTLE: "Livestock", ORCHARD: "Orchard", CROP: "Crops" };
export const STATUS = {
  DRAFT: "Draft", UPCOMING: "Upcoming", OPEN: "Open for Investment", PAUSED: "Temporarily Paused", FUNDED: "Fully Funded", IN_PROGRESS: "In Progress", LIQUIDATED: "Completed",
  ACTIVE: "Active", COMPLETED: "Completed", PENDING: "Pending", PENDING_PAYMENT: "Legacy Payment Pending Review", PENDING_REVIEW: "Request Pending Review", APPROVED_AWAITING_PAYMENT: "Approved — Awaiting Payment", PAYMENT_PENDING: "Payment Pending Review", PAYMENT_REJECTED: "Payment Needs Attention", PAID: "Paid & Active", CANCELLED: "Cancelled", REJECTED: "Rejected",
  VERIFIED: "Verified", NONE: "Not Submitted", LOW: "Low Risk", MEDIUM: "Medium Risk", HIGH: "High Risk", VARIABLE: "Variable / Results-Based",
  PENDING_ADMIN: "Awaiting Admin Review", PENDING_MAIN_ADMIN: "Awaiting SuperAdmin", APPROVED: "Approved", INACTIVE: "Deactivated", DEACTIVATED: "Deactivated", DELETED: "Deleted", RECONCILED: "Reconciled", DETAILS_UNAVAILABLE: "Details unavailable", MISMATCH: "Needs reconciliation", INCOMPLETE: "Settlement incomplete", SETTLED: "Settled", ACCOUNT: "Account", INVESTOR: "Investor", FIELD_MGR: "Field Manager", ADMIN: "Administrator", MAIN_ADMIN: "SuperAdmin",
};
export const TX_TYPE = { DEPOSIT: "Deposit", INVEST: "Investment", DIVIDEND: "Programme Payout", WITHDRAW: "Withdrawal" };
export const CHANNEL = { BANK: "Bank Transfer" };
export const ROLE = { INVESTOR: "Investor", FIELD_MGR: "Field Manager", ADMIN: "Administrator", MAIN_ADMIN: "SuperAdmin" };
export const LOG_TYPE = { WEIGHT: "Weight", FEED: "Feed", HEALTH: "Health & Treatment", STAGE: "Growth Stage", HARVEST: "Harvest" };
export const GENDER = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
export const AUDIT_ACTION = {
  PROJECT_CREATE: "Programme Created", PROJECT_STATUS: "Programme Status Changed", INVEST: "Investment (Wallet)", INVEST_DIRECT: "Direct Payment Submitted",
  PAYMENT_APPROVE: "Programme Payment Approved", PAYMENT_REJECT: "Programme Payment Rejected", TX_APPROVE: "Transaction Approved", TX_REJECT: "Transaction Rejected", REQUEST_CREATE: "Investment Request Submitted", REQUEST_APPROVE: "Investment Request Approved", REQUEST_REJECT: "Investment Request Rejected", FIELD_APPROVE: "Field Evidence Approved", FIELD_REJECT: "Field Evidence Rejected",
  KYC_APPROVE: "KYC Approved", KYC_REJECT: "KYC Rejected", FIELD_LOG: "Field Update", ROLE_CHANGE: "Role Changed", ALLOCATE: "Programme Proceeds Distributed", FINANCIAL_ENTRY_CREATE: "Programme Financial Entry Submitted", FINANCIAL_ENTRY_APPROVE: "Programme Financial Entry Approved", FINANCIAL_ENTRY_REJECT: "Programme Financial Entry Rejected",
};

export const label = (map, key) => map[key] ?? key;
