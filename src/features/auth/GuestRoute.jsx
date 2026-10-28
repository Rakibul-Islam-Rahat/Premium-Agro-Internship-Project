import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROLE_HOME } from "@/config/roles";
import Loader from "@/pages/Loader";

export default function GuestRoute({ children }) {
  const { user, status } = useAuth();
  if (status === "loading") return <Loader />;
  return user ? <Navigate to={ROLE_HOME[user.role]} replace /> : children;
}
