import { CHANNEL } from "@/config/labels";
import { contractHash } from "@/lib/sha256";
import { formatBDT } from "@/lib/money";
import { fmtDate, fmtDateTime, maskNid } from "@/lib/format";
import { Rows, Seal, Section, Sheet } from "./parts";

const CLAUSES = [
  "This record concerns participation in the single Premium Agro Collective Investment Program. Investor capital may be allocated by programme management among the approved agro activities described in the programme's current disclosures.",
  "No fixed profit percentage or capital return is promised. Any distribution depends on actual programme revenue, expenses, liabilities, verified accounts, market conditions and the applicable approved distribution policy.",
  "Agricultural operations are exposed to operational, weather, disease, input-cost, market-price, counterparty and other risks. The investor may receive less than the amount invested or lose some or all capital.",
  "The programme should maintain records and supporting evidence for material receipts and expenses. Final distributions may only be made after required review and programme close-out.",
  "The nominee recorded in this profile is the investor's father. Supporting identity details should be checked and kept current by the programme administrator.",
  "This file is a software-generated investment record for the user's My investments area. It is not a substitute for a legally reviewed, signed agreement, regulatory disclosure or advice from a qualified legal professional.",
];

export default function DeedDocument({ inv, project, user }) {
  const profile = user.profile ?? {};
  const nominee = profile.nominee ?? {};
  const method = inv.payment ? `Bank transfer — ${CHANNEL[inv.payment.channel] ?? inv.payment.channel} (${inv.payment.trxId ?? "reference unavailable"})` : "Historical demo investment record";
  return <Sheet title="Investment Record" subtitle={`Record No.: ${inv.id}`}>
    <Section title="1. Parties and investor details">
      <p className="mb-2">Programme operator: <b>Premium Agro</b></p>
      <p className="mb-1">Investor</p>
      <Rows rows={[["Name", user.name], ["Father Name", profile.fatherName], ["Mother Name", profile.motherName], ["Date of Birth", profile.dob && fmtDate(profile.dob)],
        ["National ID Number", maskNid(user.kyc?.nid)], ["Current Address", [profile.address?.present, profile.address?.district].filter(Boolean).join(", ")], ["Mobile", user.phone]]} />
    </Section>
    <Section title="2. Collective programme details">
      <Rows rows={[["Programme Name", project.title], ["Location", project.location], ["Programme Description", project.description], ["Current Programme Stage", project.stage ?? "Not stated"]]} />
    </Section>
    <Section title="3. Investment amount and payment record">
      <Rows rows={[["Investment Amount", <b key="amount">{formatBDT(inv.amount)}</b>], ["Payment Method", method], ["Investment Status", inv.status], ["Record Date", fmtDate(inv.createdAt)]]} />
    </Section>
    <Section title="4. Nominee information">
      <Rows rows={[["Name", nominee.name || profile.fatherName], ["Relationship", "Father"], ["Identification Document / Birth Registration", maskNid(nominee.nid)], ["Mobile", nominee.phone]]} />
    </Section>
    <Section title="5. Important risk and return terms">
      <ol className="list-decimal space-y-1.5 pl-5">{CLAUSES.map((clause) => <li key={clause}>{clause}</li>)}</ol>
    </Section>
    <Seal hash={contractHash(inv)} signedAt={fmtDateTime(inv.createdAt)} />
  </Sheet>;
}
