import { useEffect, useMemo, useState } from "react";
import { Headset, MessageCircle, Send, UserRound, Wifi } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextArea } from "@/components/common/form";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { fmtDateTime } from "@/lib/format";
import { api } from "@/services/api";
import { useDb } from "@/services/mock/store";
import { useLanguage } from "@/context/LanguageContext";

const ADMIN_ROLES = ["ADMIN", "MAIN_ADMIN"];
const WHATSAPP_URL = "https://wa.me/8801742805845?text=Hello!%20I%20need%20some%20help"; // Preserved as supplied; verify number/target before production.

function WhatsAppCard({ t }) {
  return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-full bg-emerald-100 p-3 text-emerald-800"><MessageCircle className="h-5 w-5" /></div><div><p className="font-semibold">{t("WhatsApp support")}</p><p className="text-sm text-muted-foreground">{t("Contact number")}: +88 01885438711</p><p className="mt-1 text-xs text-muted-foreground">{t("For urgent questions, use WhatsApp. Avoid sending passwords, PINs or full banking credentials.")}</p></div></div><a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800">{t("Open WhatsApp")}</a></CardContent></Card>;
}

function MessageView({ message, self }) {
  return <div className={`flex ${self ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${self ? "bg-primary text-primary-foreground" : "border bg-background"}`}><p className="mb-1 text-xs opacity-75">{message.senderName} · {fmtDateTime(message.createdAt)}</p><p className="whitespace-pre-wrap break-words text-sm">{message.text}</p></div></div>;
}

export default function HelpSupport() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const messages = useDb((s) => s.supportMessages ?? []);
  const users = useDb((s) => s.users ?? []);
  const [threadId, setThreadId] = useState(user.id);
  const [draft, setDraft] = useState("");
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const threads = useMemo(() => {
    const seen = new Map();
    for (const msg of messages) {
      if (!seen.has(msg.threadId)) seen.set(msg.threadId, { id: msg.threadId, latest: msg.createdAt, count: 0, unread: false });
      const thread = seen.get(msg.threadId); thread.count += 1;
      if (new Date(msg.createdAt) > new Date(thread.latest)) thread.latest = msg.createdAt;
      if (msg.senderId !== user.id && !msg.readByAdmin && msg.senderId !== thread.id) thread.unread = true;
      if (msg.senderRole === "INVESTOR" && !msg.readByAdmin) thread.unread = true;
    }
    return [...seen.values()].sort((a, b) => new Date(b.latest) - new Date(a.latest));
  }, [messages, user.id]);
  const activeThread = isAdmin ? threadId : user.id;
  const conversation = useMemo(() => messages.filter((m) => m.threadId === activeThread).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [messages, activeThread]);
  useEffect(() => { if (isAdmin && threadId) api.markSupportThreadRead(user.id, threadId).catch(() => {}); }, [isAdmin, user.id, threadId]);
  const [send, sending] = useAction(async () => {
    const body = draft.trim();
    if (!body) throw new Error("Write a message before sending.");
    if (isAdmin) await api.replySupportMessage(user.id, activeThread, body);
    else await api.sendSupportMessage(user.id, body);
    setDraft("");
  }, "Message sent");
  const sendMessage = async (event) => { event.preventDefault(); await send(); };
  const activePerson = users.find((u) => u.id === activeThread);

  return <>
    <PageHeader title="Help & Support" description={isAdmin ? "Review investor conversations, reply to questions and follow up on unresolved issues." : "Send a message to the Premium Agro support team. You can follow the conversation here."} />
    {!isAdmin && <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-100"><Wifi className="h-4 w-4 shrink-0" /><p>{t("This demo updates across open tabs on the same browser. Multi-device real-time delivery requires the production support backend.")}</p></div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden"><CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-base"><Headset className="h-5 w-5" />{isAdmin ? `${activePerson?.name ?? "Investor"} — conversation` : t("Message Premium Agro")}</CardTitle></CardHeader>
        <CardContent className="flex min-h-[460px] flex-col gap-4 p-4"><div className="flex-1 space-y-3 overflow-y-auto">{conversation.length ? conversation.map((msg) => <MessageView key={msg.id} message={msg} self={msg.senderId === user.id} />) : <EmptyState title={isAdmin ? "No messages in this conversation" : "No messages yet"} description={isAdmin ? "Choose a thread or wait for a new investor message." : "Send your question below. Keep account or payment details secure."} />}</div>
          <form onSubmit={sendMessage} className="space-y-2 border-t pt-3"><TextArea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={3000} placeholder={t("Type your message…")} rows={3} aria-label={t("Type your message…")} /><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{draft.length}/3000</span><Button type="submit" disabled={sending || draft.trim().length < 2 || (isAdmin && !activeThread)}><Send className="mr-2 h-4 w-4" />{sending ? t("Sending…") : t("Send message")}</Button></div></form>
        </CardContent></Card>
      {isAdmin ? <Card><CardHeader><CardTitle className="text-base">Support inbox</CardTitle><p className="text-sm text-muted-foreground">{threads.length} conversation(s)</p></CardHeader><CardContent className="space-y-2">{threads.length ? threads.map((thread) => { const person = users.find((u) => u.id === thread.id); const latest = messages.filter((m) => m.threadId === thread.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; return <button key={thread.id} type="button" onClick={() => setThreadId(thread.id)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted ${activeThread === thread.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0" /><span className="flex-1 truncate font-medium">{person?.name ?? latest?.senderName ?? "User"}</span>{thread.unread && <span className="h-2 w-2 rounded-full bg-emerald-600" aria-label="Unread" />}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{latest?.text}</p><p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(thread.latest)}</p></button>; }) : <EmptyState title="Inbox is empty" description="Investor conversations will appear here when someone sends a message." />}</CardContent></Card> : <WhatsAppCard t={t} />}
    </div>
    {isAdmin && <div className="mt-4"><WhatsAppCard t={t} /></div>}
  </>;
}
