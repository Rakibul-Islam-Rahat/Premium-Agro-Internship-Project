import PageHeader from "@/components/common/PageHeader";
import { ProjectPaymentQueue } from "./queue";

export default function Payments() {
  return <>
    <PageHeader title="Payment Review" description="Match the submitted bank reference and receipt against the organisation's bank statement before confirming the investment." />
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-950"><strong>Required control:</strong> request approval does not activate an investment. Confirm the actual bank credit independently; only then does the investment become active and the investment record become available.</div>
    <h2 className="mb-3 text-lg font-semibold">Bank payments awaiting confirmation</h2>
    <ProjectPaymentQueue />
  </>;
}
