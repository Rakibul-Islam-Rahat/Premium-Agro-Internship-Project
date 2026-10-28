import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GENDER } from "@/config/labels";
import { useAuth } from "@/features/auth/AuthContext";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { fmtDate } from "@/lib/format";
import { Decision } from "./queue";

const Group = ({ title, rows }) => (
  <section className="mb-4"><h3 className="mb-1.5 border-b pb-1 text-sm font-semibold text-primary">{title}</h3>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words font-medium">{v || "—"}</dd></div>)}</dl></section>
);

function IdentityDocument({ label, document }) {
  const actual = document && typeof document === "object" && typeof document.dataUrl === "string";
  return <div className="rounded-lg border p-3">
    <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
    {!document ? <p className="text-sm text-muted-foreground">Not provided</p> : actual ? document.type?.startsWith("image/") ? <a href={document.dataUrl} target="_blank" rel="noreferrer" className="block"><img src={document.dataUrl} alt={label} className="max-h-56 w-full rounded-md object-contain" /><span className="mt-2 block break-words text-xs font-medium underline">Open full-size · {document.name}</span></a> : <a href={document.dataUrl} target="_blank" rel="noreferrer" className="break-words text-sm font-medium text-primary underline">View PDF · {document.name}</a> : <p className="break-words text-sm text-amber-800">{String(document)} — sample filename only; no file is attached</p>}
  </div>;
}

export default function KycDesk() {
  const { user: admin } = useAuth();
  const users = useDb((s) => s.users);
  const [openId, setOpenId] = useState(null);
  const rows = useMemo(() => users.filter((u) => u.role === "INVESTOR" && u.kyc.status !== "NONE").sort((a, b) => (a.kyc.status === "PENDING" ? -1 : 1) - (b.kyc.status === "PENDING" ? -1 : 1)), [users]);
  const u = users.find((x) => x.id === openId);
  const decide = (id) => (ok) => api.reviewKyc(admin.id, id, ok);
  return (
    <>
      <PageHeader title="KYC & Compliance Desk" description="Verify each investor’s identity and nominee details before investment." />
      <DataTable rows={rows} columns={[
        { key: "n", header: "Investor", render: (x) => <><b>{x.name}</b><span className="block text-xs text-muted-foreground">{x.email}</span></> },
        { key: "nid", header: "National ID", render: (x) => <code className="text-xs">{x.kyc.nid}</code> },
        { key: "v", header: "Details", render: (x) => <Button size="sm" variant="outline" onClick={() => setOpenId(x.id)}><Eye className="mr-1 h-3.5 w-3.5" />Full Details</Button> },
        { key: "a", header: "Decision", render: (x) => <Decision status={x.kyc.status} approveLabel="Verify" onDecide={decide(x.id)} /> },
      ]} />
      <Dialog open={!!u} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {u && <>
            <DialogHeader><DialogTitle>{u.name}</DialogTitle><DialogDescription className="flex items-center gap-2">KYC Information <StatusBadge status={u.kyc.status} /></DialogDescription></DialogHeader>
            <Group title="Personal Information" rows={[["Father Name", u.profile.fatherName], ["Mother Name", u.profile.motherName], ["Date of Birth", u.profile.dob && fmtDate(u.profile.dob)], ["Gender", GENDER[u.profile.gender]], ["Occupation", u.profile.occupation], ["Mobile", u.phone]]} />
            <Group title="Address" rows={[["Current", u.profile.address.present], ["Permanent", u.profile.address.permanent], ["District", u.profile.address.district], ["Division", u.profile.address.division]]} />
            <Group title="Identification Details" rows={[["National ID", u.kyc.nid], ["TIN", u.kyc.tin], ["Passport", u.kyc.passport]]} />
            <section className="mb-4"><h3 className="mb-2 border-b pb-1 text-sm font-semibold text-primary">Uploaded identity documents</h3><div className="grid gap-3 sm:grid-cols-3"><IdentityDocument label="National ID — Front" document={u.kyc.docs?.nidFront} /><IdentityDocument label="National ID — Back" document={u.kyc.docs?.nidBack} /><IdentityDocument label="Recent Photo" document={u.kyc.docs?.photo} /></div></section>
            <Group title="Nominee" rows={[["Name", u.profile.nominee.name], ["Relationship", u.profile.nominee.relation], ["Date of Birth", u.profile.nominee.dob && fmtDate(u.profile.nominee.dob)], ["National ID/Birth Registration", u.profile.nominee.nid], ["Mobile", u.profile.nominee.phone], ["Address", u.profile.nominee.address]]} />
            {u.kyc.status === "PENDING" && <Decision status="PENDING" approveLabel="Verify" onDecide={async (ok) => { await decide(u.id)(ok); setOpenId(null); }} />}
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
