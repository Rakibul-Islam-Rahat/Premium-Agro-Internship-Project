import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROLE_HOME } from "@/config/roles";
import Loader from "@/pages/Loader";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return children ?? <Outlet />;
}
