import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Eye } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import DeedDocument from "@/components/documents/DeedDocument";
import DocumentViewer from "@/components/documents/DocumentViewer";
import { Button } from "@/components/ui/button";
import { bn, formatBDT } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { usePortfolio } from "./hooks";

export default function Portfolio() {
  const { mine, user } = usePortfolio();
  const [doc, setDoc] = useState(null);
  const rows = [...mine].filter((i) => i.status !== "REJECTED").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const open = (i, autoPrint) => setDoc({ title: `Agreement — ${i.project.title}`, autoPrint, node: <DeedDocument inv={i} project={i.project} user={user} /> });
  return (
    <>
      <PageHeader title="My investments" description="Your participation in the single pooled programme and its latest status." />
      <DataTable rows={rows} empty="You have not made any investments yet" columns={[
        { key: "p", header: "Investment programme", render: (i) => <Link className="font-medium hover:underline" to={`/dashboard/tracker?project=${i.projectId}`}>{i.project.title}</Link> },
                { key: "amount", header: "Investment", render: (i) => formatBDT(i.amount) },
        { key: "ret", header: "Actual proceeds / return status", render: (i) => i.status === "COMPLETED" ? <b className="text-primary">{formatBDT(i.payout)}</b> : <span className="text-sm text-muted-foreground">Variable — not guaranteed</span> },
        { key: "date", header: "Date", render: (i) => fmtDate(i.createdAt) },
        { key: "st", header: "Status", render: (i) => <StatusBadge status={i.status} /> },
        { key: "c", header: "Agreement", render: (i) => i.status === "PENDING_PAYMENT" ? <span className="text-xs text-muted-foreground">Available after verification</span> : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => open(i, false)}><Eye className="mr-1 h-3.5 w-3.5" />View</Button>
            <Button size="sm" variant="outline" onClick={() => open(i, true)}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
          </div>) },
      ]} />
      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </>
  );
}
