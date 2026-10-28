// Application roles and landing pages. Finance work is handled by administrators.
export const ROLES = { INVESTOR: "INVESTOR", FIELD_MGR: "FIELD_MGR", ADMIN: "ADMIN", MAIN_ADMIN: "MAIN_ADMIN" };
export const ROLE_HOME = { INVESTOR: "/dashboard", FIELD_MGR: "/field", ADMIN: "/admin", MAIN_ADMIN: "/admin" };
export const ROLE_VERIFICATION = { INVESTOR: null, FIELD_MGR: "OTP", ADMIN: "2FA", MAIN_ADMIN: "2FA" };
