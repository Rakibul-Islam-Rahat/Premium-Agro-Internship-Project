import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { AUDIT_ACTION } from "@/config/labels";
import { useDb } from "@/services/mock/store";
import { fmtDateTime } from "@/lib/format";

export default function AuditLog() {
  const audit = useDb((s) => s.audit);
  return (
    <>
      <PageHeader title="Audit Log" description="An immutable record of every financial and administrative change." />
      <DataTable rows={audit} columns={[
        { key: "d", header: "When", render: (a) => fmtDateTime(a.date) }, { key: "a", header: "Who", render: (a) => a.actorName },
        { key: "x", header: "Action", render: (a) => AUDIT_ACTION[a.action] ?? a.action }, { key: "e", header: "Entity", render: (a) => <code className="text-xs">{a.entity}</code> }, { key: "t", header: "Description", render: (a) => a.detail },
      ]} />
    </>
  );
}
