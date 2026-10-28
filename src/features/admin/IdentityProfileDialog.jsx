import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/common/StatusBadge";
import { GENDER } from "@/config/labels";
import { fmtDate } from "@/lib/format";

function Group({ title, rows }) {
  return <section className="mb-4"><h3 className="mb-2 border-b pb-1 text-sm font-semibold text-primary">{title}</h3><dl className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl></section>;
}

function DocumentCard({ label, document }) {
  const actual = document && typeof document === "object" && typeof document.dataUrl === "string";
  return <div className="min-w-0 rounded-xl border bg-background p-3">
    <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
    {!document ? <p className="text-sm text-muted-foreground">Not provided</p> : actual ? document.type?.startsWith("image/")
      ? <a href={document.dataUrl} target="_blank" rel="noreferrer" className="block"><img src={document.dataUrl} alt={label} className="max-h-48 w-full rounded-lg bg-muted object-contain" /><span className="mt-2 block break-words text-xs font-medium text-primary underline">Open full size · {document.name}</span></a>
      : <a href={document.dataUrl} target="_blank" rel="noreferrer" className="break-words text-sm font-medium text-primary underline">Open PDF · {document.name}</a>
      : <p className="break-words text-xs text-amber-800">{String(document)} — sample filename only; no file is attached.</p>}
  </div>;
}

export default function IdentityProfileDialog({ user, open, onOpenChange }) {
  if (!user) return null;
  const profile = user.profile ?? {};
  const address = profile.address ?? {};
  const nominee = profile.nominee ?? {};
  const kyc = user.kyc ?? {};
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
      <DialogHeader>
        <DialogTitle>Identity profile · {user.name}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">{user.email} <StatusBadge status={kyc.status ?? "NONE"} /></DialogDescription>
      </DialogHeader>
      <Group title="Personal information" rows={[["Full name", user.name], ["Email", user.email], ["Mobile", user.phone], ["Father Name", profile.fatherName], ["Mother Name", profile.motherName], ["Date of birth", profile.dob && fmtDate(profile.dob)], ["Gender", GENDER[profile.gender] ?? profile.gender], ["Occupation", profile.occupation]]} />
      <Group title="Address" rows={[["Current address", address.present], ["Permanent address", address.permanent], ["District", address.district], ["Division", address.division]]} />
      <Group title="Identification details" rows={[["National ID", kyc.nid], ["TIN", kyc.tin], ["Passport", kyc.passport]]} />
      <section className="mb-4"><h3 className="mb-2 border-b pb-1 text-sm font-semibold text-primary">Uploaded identity documents</h3><div className="grid gap-3 sm:grid-cols-3"><DocumentCard label="National ID · Front" document={kyc.docs?.nidFront} /><DocumentCard label="National ID · Back" document={kyc.docs?.nidBack} /><DocumentCard label="Recent photo" document={kyc.docs?.photo} /></div></section>
      <Group title="Nominee information" rows={[["Name", nominee.name], ["Relationship", nominee.relation], ["Date of birth", nominee.dob && fmtDate(nominee.dob)], ["National ID / birth registration", nominee.nid], ["Mobile", nominee.phone], ["Address", nominee.address]]} />
      <p className="rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">Identity documents contain sensitive personal information. Use them only for account verification and do not download or share them outside the authorized review process.</p>
    </DialogContent>
  </Dialog>;
}
