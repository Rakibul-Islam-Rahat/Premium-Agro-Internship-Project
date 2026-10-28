import { useLanguage } from "@/context/LanguageContext";
import { STATUS } from "@/config/labels";

const TONES = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const MAP = {
  OPEN: "green", RECONCILED: "green", SETTLED: "green", ACTIVE: "green", APPROVED: "green", COMPLETED: "green", VERIFIED: "green", LOW: "green", PAID: "green", APPROVED_AWAITING_PAYMENT: "blue", LIQUIDATED: "gray", DRAFT: "gray", NONE: "gray", CANCELLED: "gray",
  UPCOMING: "blue", PAUSED: "amber", INCOMPLETE: "amber", DETAILS_UNAVAILABLE: "gray", MISMATCH: "red", FUNDED: "blue", IN_PROGRESS: "blue", MEDIUM: "amber", PENDING: "amber", PENDING_ADMIN: "amber", PENDING_MAIN_ADMIN: "amber", PENDING_REVIEW: "amber", PAYMENT_PENDING: "amber", PAYMENT_REJECTED: "red", PENDING_PAYMENT: "amber", HIGH: "red", REJECTED: "red", INACTIVE: "red", DEACTIVATED: "red", DELETED: "red",
};
export default function StatusBadge({ status }) {
  const { t } = useLanguage();
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[MAP[status] ?? "gray"]}`}>{t(STATUS[status] ?? status)}</span>;
}
