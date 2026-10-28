import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Camera, ClipboardList, Sprout } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatCard from "@/components/common/StatCard";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { LOG_TYPE } from "@/config/labels";
import { useDb } from "@/services/mock/store";
import { bn } from "@/lib/money";
import { fmtDate } from "@/lib/format";

export default function FieldOverview() {
  const projects = useDb((s) => s.agroProjects ?? []);
  const logs = useDb((s) => s.fieldLogs);
  const live = useMemo(() => projects.filter((p) => p.status === "ACTIVE"), [projects]);
  const recent = useMemo(() => [...logs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8), [logs]);
  const title = (id) => projects.find((p) => p.id === id)?.title;
  return (
    <>
      <PageHeader title="Field Activity" description="Upload measurements and evidence for a specific underlying agro project." actions={<Button asChild><Link to="log">New Update</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Projects" value={bn(live.length)} icon={Sprout} />
        <StatCard label="Logs This Month" value={bn(logs.filter((l) => Date.now() - new Date(l.date) < 30 * 864e5).length)} icon={ClipboardList} />
        <StatCard label="Uploaded Media" value={bn(logs.reduce((a, l) => a + l.media.length, 0))} icon={Camera} />
      </div>
      <h2 className="mb-3 mt-6 text-lg font-semibold">Underlying Projects Requiring Updates</h2>
      <DataTable rows={live} columns={[{ key: "t", header: "Underlying project", render: (p) => p.title }, { key: "l", header: "Location", render: (p) => p.location }, { key: "s", header: "Status", render: (p) => <StatusBadge status={p.status} /> }]} />
      <h2 className="mb-3 mt-6 text-lg font-semibold">Recent Logs</h2>
      <DataTable rows={recent} columns={[{ key: "d", header: "Date", render: (l) => fmtDate(l.date) }, { key: "p", header: "Underlying project", render: (l) => title(l.projectId) }, { key: "t", header: "Category", render: (l) => LOG_TYPE[l.type] }, { key: "n", header: "Description", render: (l) => `${l.tag ? `#${l.tag} ` : ""}${l.value != null ? bn(l.value) : ""} ${l.unit ?? ""} ${l.note}` }]} />
    </>
  );
}
