import { createBrowserRouter, Navigate } from "react-router-dom";
import ProtectedRoute from "@/features/auth/ProtectedRoute";
import GuestRoute from "@/features/auth/GuestRoute";
import { useAuth } from "@/features/auth/AuthContext";
import { ROLES, ROLE_HOME } from "@/config/roles";
import ErrorPage from "@/pages/ErrorPage";
import NotFoundPage from "@/pages/NotFoundPage";
import LoginPage from "@/pages/LoginPage";
import RegistrationPage from "@/pages/RegistrationPage";
import AppShell from "./layouts/AppShell";

const page = (loader) => ({ lazy: async () => ({ Component: (await loader()).default }) });
const guard = (role, path, children) => ({ path, element: <ProtectedRoute allowedRoles={Array.isArray(role) ? role : [role]} />, children });

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? ROLE_HOME[user.role] : "/login"} replace />;
}

export const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <GuestRoute><LoginPage /></GuestRoute> },
  { path: "/register", element: <GuestRoute><RegistrationPage /></GuestRoute> },
  {
    element: <ProtectedRoute><AppShell /></ProtectedRoute>,
    errorElement: <ErrorPage />,
    children: [
      { path: "notifications", ...page(() => import("@/features/shared/Notifications")) },
      { path: "support", ...page(() => import("@/features/shared/HelpSupport")) },
      guard(ROLES.INVESTOR, "dashboard", [
        { index: true, ...page(() => import("@/features/investor/Overview")) },
        { path: "marketplace", ...page(() => import("@/features/investor/Marketplace")) },
        { path: "marketplace/project/:id", ...page(() => import("@/features/investor/AgroProjectDetail")) },
        { path: "marketplace/:id", ...page(() => import("@/features/investor/ProjectDetail")) },
        { path: "requests", ...page(() => import("@/features/investor/InvestmentRequests")) },
        { path: "portfolio", ...page(() => import("@/features/investor/Portfolio")) },
        { path: "tracker", ...page(() => import("@/features/investor/Tracker")) },
        { path: "wallet", ...page(() => import("@/features/investor/Wallet")) },
        { path: "reports", ...page(() => import("@/features/reports/Reports")) },
        { path: "legal", ...page(() => import("@/features/investor/Legal")) },
        { path: "profile", ...page(() => import("@/features/investor/Profile")) },
      ]),
      guard(ROLES.FIELD_MGR, "field", [
        { index: true, ...page(() => import("@/features/field/Overview")) },
        { path: "log", ...page(() => import("@/features/field/LogUpdate")) },
      ]),
      guard([ROLES.ADMIN, ROLES.MAIN_ADMIN], "admin", [
        { index: true, ...page(() => import("@/features/admin/Overview")) },
        { path: "campaigns", ...page(() => import("@/features/admin/Campaigns")) },
        { path: "projects", ...page(() => import("@/features/admin/AgroProjects")) },
        { path: "financial-entries", ...page(() => import("@/features/admin/FinancialEntries")) },
        { path: "requests", ...page(() => import("@/features/admin/InvestmentRequests")) },
        { path: "payments", ...page(() => import("@/features/admin/Payments")) },
        { path: "field-approvals", ...page(() => import("@/features/admin/FieldApprovals")) },
        { path: "withdrawals", ...page(() => import("@/features/admin/Withdrawals")) },
        { path: "allocation", ...page(() => import("@/features/admin/Allocation")) },
        { path: "ledger", ...page(() => import("@/features/admin/Ledger")) },
        { path: "reports", ...page(() => import("@/features/reports/Reports")) },
        { path: "kyc", ...page(() => import("@/features/admin/KycDesk")) },
        { path: "users", ...page(() => import("@/features/admin/Users")) },
        { path: "audit", ...page(() => import("@/features/admin/AuditLog")) },
        { path: "legal-documents", ...page(() => import("@/features/admin/LegalDocuments")) },
      ]),
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
