import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { LanguageProvider } from "./context/LanguageContext";

export default function App() {
  return <LanguageProvider><RouterProvider router={router} /></LanguageProvider>;
}
