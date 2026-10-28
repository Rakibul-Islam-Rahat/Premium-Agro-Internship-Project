import { ArrowUpRight, BadgeCheck, BarChart3, Sprout } from "lucide-react";
import LoginForm from "@/components/auth/LoginForm";
import AuthIllustrationSvg from "../assets/login.svg";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

const features = [
  { icon: BadgeCheck, title: "Verified investors", copy: "Identity checks before any payment is enabled." },
  { icon: BarChart3, title: "Programme transparency", copy: "Follow collective milestones, evidence, and variable programme outcomes." },
];

export default function LoginPage() {
  const { t } = useLanguage();
  return (
    <main className="login-page min-h-screen px-4 py-7 sm:px-8 lg:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-2xl shadow-emerald-950/10 lg:grid-cols-[1.02fr_.98fr]">
        <section className="relative flex flex-col overflow-hidden bg-gradient-to-br from-[#082f25] via-[#0b513c] to-[#11704a] p-7 text-white sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-28 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-12 -top-4 h-48 w-48 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Sprout className="h-6 w-6" /></div><div><p className="text-lg font-bold tracking-tight">Premium Agro</p><p className="text-xs text-emerald-100/75">{t("Agricultural Investment Platform")}</p></div></div>
          <div className="relative my-auto py-12">
            <p className="mb-4 text-xs font-bold uppercase tracking-[.24em] text-emerald-200">{t("Invest with clarity")}</p>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">{t("Grow capital with a closer view of the farm.")}</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-emerald-50/80">{t("A transparent place to request participation in one pooled investment programme, submit bank payments after approval, follow progress and review actual financial results.")}</p>
            <div className="mt-8 flex flex-wrap gap-3">{features.map(({ icon: Icon, title, copy }) => <div key={title} className="flex min-w-0 flex-1 basis-48 gap-3 rounded-xl border border-white/15 bg-white/[0.07] p-3.5 backdrop-blur-sm"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><p className="text-sm font-semibold">{t(title)}</p><p className="mt-1 text-xs leading-5 text-emerald-50/70">{t(copy)}</p></div></div>)}</div>
            <div className="mt-8 hidden items-center gap-5 md:flex"><img src={AuthIllustrationSvg} alt="Agricultural investment illustration" className="h-28 w-36 object-contain opacity-90" /><p className="max-w-xs text-xs leading-5 text-emerald-50/60">{t("A clear process, documented decisions, and verified field updates — from request to settlement.")}</p></div>
          </div>
          <div className="relative flex items-center justify-between border-t border-white/15 pt-4 text-xs text-emerald-100/65"><span>Premium Agro Investor Portal</span><span className="inline-flex items-center gap-1">{t("Secure access")} <ArrowUpRight className="h-3.5 w-3.5" /></span></div>
        </section>
        <section className="flex items-center justify-center bg-[#fbfcfa] p-4 sm:p-8 lg:p-10"><div className="w-full max-w-md"><div className="mb-5 flex items-center justify-between gap-3 text-xs text-slate-400"><span>{t("INVESTOR & OPERATIONS PORTAL")}</span><LanguageSwitcher /></div><LoginForm /><p className="mt-5 text-center text-sm text-slate-500">{t("New to Premium Agro?")} <Link className="font-semibold text-emerald-800 hover:text-emerald-950" to="/register">{t("Create an account")}</Link></p><p className="mt-4 text-center text-xs leading-5 text-slate-400">{t("Continuing means you agree to follow Premium Agro’s investment terms and verification process.")}</p></div></section>
      </div>
    </main>
  );
}
