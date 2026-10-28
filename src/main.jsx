import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/AuthContext";
import ThemeProvider from "./providers/ThemeProvider";
import { LoadingBarContainer } from "react-top-loading-bar";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LoadingBarContainer>
          <App />
        </LoadingBarContainer>
      </AuthProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  </StrictMode>
);
