import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CheckCircle2, Eye, EyeOff, ShieldCheck, Sprout, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/services/auth.service";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10";
const roles = [
  { value: "INVESTOR", label: "Investor", description: "Submit an amount-based request, complete verification, and track pooled-programme outcomes." },
  { value: "FIELD_MGR", label: "Field Manager", description: "Submit programme progress updates and field evidence for review." },
  { value: "ADMIN", label: "Administrator", description: "Request administrative access. SuperAdmin approval is required." },
];

export default function RegistrationPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "INVESTOR", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const update = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const selectedRole = roles.find((item) => item.value === form.role) ?? roles[0];
  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return toast.error("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return toast.error("Enter a valid email address.");
    if (form.phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(form.phone.trim())) return toast.error("Enter a valid phone number.");
    if (form.password.length < 8) return toast.error("Use a password with at least 8 characters.");
    if (form.password !== form.confirmPassword) return toast.error("The passwords do not match.");
    setPending(true);
    try {
      await authService.register({ name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), role: form.role, password: form.password });
      setSubmitted(true);
      toast.success("Registration submitted successfully.");
    } catch (error) {
      toast.error(error.message || "We could not submit your registration.");
    } finally {
      setPending(false);
    }
  };

  return <main className="login-page min-h-screen px-4 py-6 sm:px-8 lg:py-10">
    <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-2xl shadow-emerald-950/10 lg:grid-cols-[.9fr_1.1fr]">
      <section className="relative flex flex-col overflow-hidden bg-gradient-to-br from-[#082f25] via-[#0b513c] to-[#11704a] p-7 text-white sm:p-10 lg:p-12">
        <div className="pointer-events-none absolute -right-28 -top-20 h-80 w-80 rounded-full border border-white/10" /><div className="pointer-events-none absolute -right-12 -top-4 h-48 w-48 rounded-full border border-white/10" />
        <Link to="/login" className="relative inline-flex w-fit items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Sprout className="h-6 w-6" /></span><span><b className="block text-lg tracking-tight">Premium Agro</b><span className="text-xs text-emerald-100/75">{t("Agricultural Investment Platform")}</span></span></Link>
        <div className="relative my-auto py-12">
          <p className="mb-4 text-xs font-bold uppercase tracking-[.24em] text-emerald-200">{t("Create your account")}</p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">{t("Be part of a more transparent growing season.")}</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-emerald-50/80">{t("A clear, documented path from account verification to participation in one pooled programme, verified updates, and transparent financial records.")}</p>
          <div className="mt-8 space-y-3">
            {[{ icon: ShieldCheck, title: "Human-reviewed access", copy: "New accounts stay pending until the right approvers complete their review." }, { icon: BadgeCheck, title: "Payments after approval", copy: "Investor payments are not enabled until identity and investment requests are approved." }, { icon: UsersRound, title: "Role-based access", copy: "Investor, Field Manager, and Administrator access follows separate approval rules." }].map(({ icon: Icon, title, copy }) => <div key={title} className="flex gap-3 rounded-xl border border-white/15 bg-white/[.07] p-3.5"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-emerald-50/70">{copy}</p></div></div>)}
          </div>
        </div>
        <div className="relative border-t border-white/15 pt-4 text-xs text-emerald-100/65">{t("Premium Agro · Account access and verification")}</div>
      </section>
      <section className="flex items-center justify-center bg-[#fbfcfa] p-4 sm:p-8 lg:p-10">
        <div className="w-full max-w-xl"><div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
          <Link to="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-emerald-800"><ArrowLeft className="h-4 w-4" />{t("Back to sign in")}</Link>
          {!submitted ? <>
            <div className="mb-6"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><UserRoundPlus className="h-5 w-5" /></div><h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Register for Premium Agro")}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t("Enter your details and choose the access type you are applying for.")}</p></div>
            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Full name *")}</span><input className={inputClass} value={form.name} onChange={update("name")} placeholder={t("Your full name")} autoComplete="name" maxLength={100} required /></label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Email address *")}</span><input className={inputClass} type="email" value={form.email} onChange={update("email")} placeholder={t("you@example.com")} autoComplete="email" maxLength={180} required /></label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Mobile number")}</span><input className={inputClass} type="tel" value={form.phone} onChange={update("phone")} placeholder={t("+880 1XXXXXXXXX")} autoComplete="tel" /></label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Account type *")}</span><select className={inputClass} value={form.role} onChange={update("role")}><option value="INVESTOR">{t("Investor")}</option><option value="FIELD_MGR">{t("Field Manager")}</option><option value="ADMIN">{t("Administrator application")}</option></select></label>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3"><p className="text-sm font-semibold text-emerald-950">{t(selectedRole.label)} approval process</p><p className="mt-1 text-xs leading-5 text-emerald-900/75">{t(selectedRole.description)} {form.role === "ADMIN" ? "Only the SuperAdmin can approve the application." : "An Administrator reviews the application first, followed by the SuperAdmin. Sign-in is enabled only after both approvals."}</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Password *")}</span><div className="relative"><input className={`${inputClass} pr-11`} type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} placeholder={t("At least 8 characters")} autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-3 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{t("Confirm password *")}</span><input className={inputClass} type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={update("confirmPassword")} placeholder={t("Re-enter your password")} autoComplete="new-password" minLength={8} required /></label>
              </div>
              <p className="text-xs leading-5 text-slate-500">{t("By registering, you confirm that your details are accurate. Do not create multiple accounts to bypass an approval decision.")}</p>
              <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={pending}>{pending ? "Submitting registration…" : "Submit registration"}</button>
            </form>
          </> : <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div><h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Application submitted")}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your account request has been recorded. {form.role === "ADMIN" ? "The SuperAdmin will review your Administrator application." : "An Administrator must review your account first, and the SuperAdmin completes the final approval."} You cannot sign in until the required approvals are complete.</p><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold text-slate-800">{t("Registration email")}</p><p className="mt-1 break-words text-slate-600">{form.email.trim().toLowerCase()}</p><p className="mt-3 font-semibold text-slate-800">{t("Requested access")}</p><p className="mt-1 text-slate-600">{t(selectedRole.label)}</p></div><button type="button" onClick={() => navigate("/login")} className="mt-6 h-11 w-full rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900">{t("Return to sign in")}</button><p className="mt-4 text-center text-sm text-slate-500">{t("Need help? Contact Premium Agro support.")}</p></div>}
        </div>
      </section>
    </div>
  </main>;
}
