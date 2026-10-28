const date = new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const month = new Intl.DateTimeFormat("en-BD", { month: "short", year: "2-digit" });
export const fmtDate = (iso) => date.format(new Date(iso));
export const fmtDateTime = (iso) => dateTime.format(new Date(iso));
export const fmtMonth = (iso) => month.format(new Date(iso));
export const maskNid = (nid = "") => `${"•".repeat(Math.max(0, nid.length - 4))}${nid.slice(-4)}`;
