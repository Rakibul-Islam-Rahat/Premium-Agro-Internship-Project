import { useEffect, useMemo, useRef, useState, useContext } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Moon, Sprout, Sun, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/AuthContext";
import { ThemeContext } from "@/context";
import { useDb } from "@/services/mock/store";
import { Button } from "@/components/ui/button";
import { bn } from "@/lib/money";
import { ROLE } from "@/config/labels";
import { NAV } from "../nav";
import { useLanguage } from "@/context/LanguageContext";

function SidebarContent({ items, onNavigate }) {
  const { t } = useLanguage();
  return <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main menu">
    {items.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={onNavigate}
      className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
      <Icon className="h-4 w-4 shrink-0" /> {t(label)}
    </NavLink>)}
  </nav>;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { darkMode, setDarkMode } = useContext(ThemeContext);
  const { language, changeLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notes = useDb((s) => s.notifications);
  const supportMessages = useDb((s) => s.supportMessages);
  const sessionAccount = useDb((s) => s.users.find((u) => u.id === user.id));
  const seenMessages = useRef(null);
  useEffect(() => {
    const status = sessionAccount?.accountStatus ?? "ACTIVE";
    const approval = sessionAccount?.approvalStatus ?? "APPROVED";
    if (!sessionAccount || status !== "ACTIVE" || approval !== "APPROVED") logout();
  }, [sessionAccount, logout]);
  useEffect(() => {
    const currentIds = new Set(supportMessages.map((m) => m.id));
    if (seenMessages.current === null) { seenMessages.current = currentIds; return; }
    if (["ADMIN", "MAIN_ADMIN"].includes(user.role)) {
      supportMessages.forEach((message) => {
        if (!seenMessages.current.has(message.id) && !["ADMIN", "MAIN_ADMIN"].includes(message.senderRole)) {
          toast.info("New Help & Support message", { description: `${message.senderName}: ${message.text}`, duration: 9000,
            action: { label: "Open inbox", onClick: () => navigate("/support") } });
        }
      });
    }
    seenMessages.current = currentIds;
  }, [supportMessages, user.role, navigate]);
  const unread = useMemo(() => notes.filter((n) => n.userId === user.id && !n.read).length, [notes, user.id]);
  const items = NAV[user.role] ?? [];
  const brand = <Link to={user.role === "INVESTOR" ? "/dashboard" : user.role === "FIELD_MGR" ? "/field" : "/admin"} className="flex h-16 shrink-0 items-center gap-2 border-b px-5 text-lg font-bold text-primary"><Sprout className="h-6 w-6" /> Premium Agro</Link>;

  return <div className="min-h-screen bg-muted/30">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-background lg:flex">{brand}<SidebarContent items={items} /></aside>
    {open && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-background">{brand}<SidebarContent items={items} onNavigate={() => setOpen(false)} /></aside></div>}
    <div className="lg:pl-64"><header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} aria-label={t("Open/close menu")}>{open ? <X /> : <Menu />}</Button>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => changeLanguage(language === "en" ? "bn" : "en")} aria-label="Change language">{language === "en" ? "বাংলা" : "English"}</Button>
        <Button variant="outline" size="icon" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme">{darkMode ? <Sun /> : <Moon />}</Button>
        <Button variant="outline" size="icon" asChild className="relative"><Link to="/notifications" aria-label={`Notifications, ${unread} unread`}><Bell />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">{bn(unread)}</span>}</Link></Button>
        <div className="hidden px-2 text-right sm:block"><p className="text-sm font-medium leading-tight">{user.name}</p><p className="text-xs text-muted-foreground">{t(ROLE[user.role])}</p></div>
        <Button variant="outline" size="icon" onClick={logout} aria-label={t("Log out")}><LogOut /></Button>
      </div>
    </header><main className="mx-auto max-w-7xl p-4 md:p-6"><Outlet /></main></div>
  </div>;
}
