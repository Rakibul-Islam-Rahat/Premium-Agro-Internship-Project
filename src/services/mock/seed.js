import { MOCK_USERS } from "./users.js";
import { contractHash } from "../../lib/sha256.js";

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const T = (taka) => taka * 100;

export const emptyProfile = () => ({
  fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi",
  address: { present: "", permanent: "", district: "", division: "" },
  nominee: { name: "", relation: "", dob: "", nid: "", phone: "", address: "" },
});
export const emptyKyc = () => ({ status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } });

const person = (o) => ({
  ...emptyProfile(), ...o,
  address: { present: "House 12, Road 5, Dhanmondi", permanent: "Village: Kashimpur, Post Office: Kashimpur", district: "Dhaka", division: "Dhaka", ...o.address },
});
const docs = { nidFront: "nid-front.jpg", nidBack: "nid-back.jpg", photo: "photo.jpg" };

export function seed() {
  const profiles = {
    u1: person({ fatherName: "Baba", motherName: "Ma", dob: "1990-04-12", gender: "MALE", occupation: "Businessperson",
      nominee: { name: "Baba", relation: "Father", dob: "1962-08-02", nid: "1962123456789", phone: "01711111111", address: "House 12, Road 5, Dhanmondi, Dhaka" } }),
    u5: person({ fatherName: "Baba", motherName: "Ma", dob: "1988-11-23", gender: "FEMALE", occupation: "Teacher",
      nominee: { name: "Baba", relation: "Father", dob: "1960-02-14", nid: "1960123456789", phone: "01722222222", address: "Mirpur, Dhaka" } }),
    u6: person({ fatherName: "Baba", motherName: "Ma", dob: "1992-06-30", gender: "MALE", occupation: "Engineer",
      nominee: { name: "Baba", relation: "Father", dob: "1964-01-10", nid: "1964123456789", phone: "01733333333", address: "Chattogram" } }),
    u7: person({ fatherName: "Baba", motherName: "Ma", dob: "1995-01-18", gender: "MALE", occupation: "Salaried Employee",
      nominee: { name: "Baba", relation: "Father", dob: "1968-05-05", nid: "1968123456789", phone: "01744444444", address: "Rajshahi" } }),
  };
  const bank = (n) => ({ accName: n, accNum: "1234567890", bankName: "Sonali Bank", branch: "" });
  const kyc = (status, nid, tin = "") => ({ ...emptyKyc(), status, nid, tin, docs: status === "NONE" ? emptyKyc().docs : docs });

  // eslint-disable-next-line no-unused-vars
  const base = MOCK_USERS.map(({ password, kycStatus, ...u }) => ({
    ...u, phone: "01700000000", autoReinvest: false, profile: profiles[u.id] ?? emptyProfile(),
    kyc: kyc(kycStatus ?? "NONE", kycStatus ? "1990123456789" : ""), bank: bank(u.name),
    accountStatus: "ACTIVE", approvalStatus: "APPROVED", registrationFlow: false,
    approval: { adminApprovedAt: null, adminApprovedBy: null, mainAdminApprovedAt: null, mainAdminApprovedBy: null },
  }));
  const extra = [
    { id: "u5", name: "Noman", email: "noman@agrofund.test", kyc: kyc("VERIFIED", "1988765432100") },
    { id: "u6", name: "Milon", email: "milon@agrofund.test", kyc: kyc("VERIFIED", "1992345678901") },
    { id: "u7", name: "Rahat", email: "rahat.pending@agrofund.test", kyc: kyc("PENDING", "1995111222333", "123456789012") },
  ].map((u) => ({ role: "INVESTOR", phone: "01800000000", autoReinvest: false, profile: profiles[u.id], bank: bank(u.name), accountStatus: "ACTIVE", approvalStatus: "APPROVED", registrationFlow: false, ...u }));

  const projects = [{
    id: "p1", title: "Premium Agro Collective Investment Programme", category: "COLLECTIVE",
    location: "Selected farming locations across Bangladesh",
    targetAmount: T(23500000), raisedAmount: 0, risk: "VARIABLE",
    status: "PAUSED", operationsStartedAt: null, progress: 0,
    stage: "Initial setup and compliance review", startDate: null, harvestDate: null,
    payment: {
      bank: "DEMO ONLY — replace with the verified Premium Agro organization account before launch",
      bankName: "Demo Bank — replace before launch", bankAccountName: "Premium Agro Demo Collection",
      bankAccountNumber: "DEMO-REPLACE-BEFORE-LAUNCH", bankBranch: "", bankVerified: false,
    },
    description: "A single pooled investment programme. Investor capital is managed collectively and may be allocated by the business to several underlying agro activities. Investors request and track one programme; they do not choose separate projects or units. Actual outcomes depend on verified revenue, operating expenses, market conditions and business execution. No return is guaranteed.",
    subprojects: [
      { title: "Livestock and cattle fattening", description: "Procurement, feed, veterinary care and livestock sales." },
      { title: "Mango and seasonal fruit orchards", description: "Orchard care, irrigation, pest management and wholesale sales." },
      { title: "Seasonal crop cultivation", description: "Seed, planting, crop care, harvesting and market sales." },
      { title: "Dairy and animal rearing", description: "Animal care, health monitoring and operational development." },
      { title: "Other approved agro activities", description: "Additional agricultural activities approved by management and documented in programme reports." },
    ],
    protocols: [
      "Maintain receipts and supporting evidence for material expenses",
      "Submit field evidence for independent administrator review",
      "Record revenue and costs before settlement",
      "Distribute only realized proceeds under the approved allocation policy",
    ],
  }];

  const agroProjects = [
    { id: "agp-livestock", programmeId: "p1", title: "Livestock & Cattle Fattening", category: "LIVESTOCK", location: "Bangladesh — operating location set by management", summary: "Livestock procurement, feed management, veterinary care and sales.", description: "This operating project covers livestock procurement, animal identification, feed planning, veterinary checks, routine health monitoring, weight measurements and the eventual sale process. Field managers submit dated evidence and measurements. Investors participate only through the pooled Premium Agro programme; this is not a separate investment product.", status: "PLANNING", progress: 0, stage: "Planning and farm preparation", startDate: "", expectedEndDate: "", createdAt: ago(30) },
    { id: "agp-orchards", programmeId: "p1", title: "Mango & Seasonal Fruit Orchards", category: "ORCHARD", location: "Bangladesh — operating location set by management", summary: "Orchard preparation, irrigation, pest management and fruit sales.", description: "This operating project covers orchard maintenance, irrigation planning, pruning, pollination and fruit-set observations, pest management, harvest estimates and recorded sales. Field updates may include dated photos and agronomic notes. Project results contribute to the pooled programme's overall financial outcomes.", status: "PLANNING", progress: 0, stage: "Planning and land assessment", startDate: "", expectedEndDate: "", createdAt: ago(30) },
    { id: "agp-crops", programmeId: "p1", title: "Seasonal Crop Cultivation", category: "CROPS", location: "Bangladesh — operating location set by management", summary: "Seed and input planning, cultivation, harvest and market records.", description: "This operating project covers seasonal crop planning, land preparation, seed and input records, planting, irrigation, crop-health observations, harvest estimates and market sales. Field managers record dated updates and evidence. Actual performance depends on weather, operating costs, yields and market conditions.", status: "PLANNING", progress: 0, stage: "Season and input planning", startDate: "", expectedEndDate: "", createdAt: ago(30) },
    { id: "agp-dairy", programmeId: "p1", title: "Dairy & Animal Rearing", category: "DAIRY", location: "Bangladesh — operating location set by management", summary: "Animal care, feeding, veterinary monitoring and dairy operations.", description: "This operating project covers dairy and animal-rearing operations, feed records, animal health, veterinary treatment, production records where applicable, equipment maintenance and recorded sales. Updates remain pending until administrator review, after which they become visible to programme investors.", status: "PLANNING", progress: 0, stage: "Planning and readiness checks", startDate: "", expectedEndDate: "", createdAt: ago(30) },
    { id: "agp-other", programmeId: "p1", title: "Other Approved Agro Activities", category: "OTHER", location: "Bangladesh — assigned per approved activity", summary: "Additional documented agricultural activities approved by management.", description: "Use this project only for additional agricultural activities that management has explicitly approved and documented. Keep project details, location, dates, allocated programme capital, financial entries and approved field updates current. Investors do not select this as a separate investment product.", status: "PLANNING", progress: 0, stage: "Pending approved activity plan", startDate: "", expectedEndDate: "", createdAt: ago(30) },
  ];

  // Demo positions are amount-based and consolidated to the one pooled programme.
  // Each investor has one position, not separate positions by underlying farm activity.
  const investments = [
    { id: "i1", investorId: "u1", projectId: "p1", amount: T(2100000), status: "ACTIVE", createdAt: ago(150) },
    { id: "i2", investorId: "u5", projectId: "p1", amount: T(3250000), status: "ACTIVE", createdAt: ago(149) },
    { id: "i3", investorId: "u6", projectId: "p1", amount: T(3200000), status: "ACTIVE", createdAt: ago(148) },
  ];
  projects[0].raisedAmount = investments.filter((i) => i.status === "ACTIVE").reduce((total, i) => total + i.amount, 0);

  let n = 0;
  const tx = (userId, type, amount, date, o = {}) => ({ id: `t${++n}`, userId, type, amount, date, channel: null, trxId: null, status: "COMPLETED", ...o });
  const transactions = investments.flatMap((investment, index) => [
    tx(investment.investorId, "DEPOSIT", investment.amount, investment.createdAt, {
      channel: "BANK", trxId: `DEMO-BANK-${index + 1}`, ref: "p1",
    }),
    tx(investment.investorId, "INVEST", -investment.amount, investment.createdAt, { ref: "p1" }),
  ]).sort((a, b) => new Date(a.date) - new Date(b.date));

  let l = 0;
  const log = (projectId, type, o) => ({ id: `l${++l}`, programmeId: "p1", projectId, type, tag: null, value: null, unit: null, note: "", media: [], loggedBy: "u2", status: "APPROVED", ...o });
  const weights = { "C-402": [285, 310, 338, 362, 391], "C-415": [270, 296, 321, 349, 374], "C-430": [292, 318, 341, 370, 399] };
  const fieldLogs = [
    ...Object.entries(weights).flatMap(([tag, ws]) => ws.map((v, i) => log("agp-livestock", "WEIGHT", { tag, value: v, unit: "kg", date: ago(150 - i * 30), media: i % 2 ? [{ caption: `Tag #${tag} — Weight measurement` }] : [] }))),
    ...[0, 1, 2, 3, 4].map((i) => log("agp-livestock", "FEED", { value: 9 + i * 0.6, unit: "kg/head/day", date: ago(150 - i * 30), note: "Mixture of fresh grass and concentrated feed" })),
    log("agp-livestock", "HEALTH", { date: ago(120), note: "Foot-and-mouth disease vaccination completed for all 80 animals." }),
    log("agp-livestock", "HEALTH", { date: ago(45), note: "Regular deworming administered. No illness detected.", media: [{ caption: "Veterinary inspection" }] }),
    log("agp-orchards", "STAGE", { note: "Blossoming has started in Blocks A and B.", date: ago(12), media: [{ caption: "Block A — Blossom" }] }),
    log("agp-orchards", "STAGE", { note: "Fruiting has begun; the irrigation schedule has been updated.", date: ago(4) }),
    log("agp-crops", "STAGE", { note: "Sowing is complete; germination is at 94%.", date: ago(6), media: [{ caption: "Plot 3 — Germination" }] }),
  ];

  const notifications = [
    { id: "n1", userId: "u1", type: "PROGRAMME", text: "Premium Agro Collective Investment Programme has an updated operating status.", date: ago(2), read: true },
    { id: "n2", userId: "u1", type: "FIELD", text: "New approved field update: Livestock and seasonal agro activities are being monitored under the pooled programme.", date: ago(1), read: false },
    { id: "n3", userId: "u4", type: "REQUEST", text: "An investment request is awaiting administrator review.", date: ago(0.2), read: false },
  ];
  const audit = [{ id: "a1", actorId: "u4", actorName: "Tanzim", action: "PROGRAM_UPDATE", entity: "p1", detail: "Collective investment programme configuration updated", date: ago(25) }];

  const investmentRequests = [{
    id: "ir1", investorId: "u1", projectId: "p1", amount: T(20000),
    status: "PENDING_REVIEW", createdAt: ago(0.4), updatedAt: ago(0.4), paymentAttempts: [],
  }];
  return { users: [...base, ...extra], projects, agroProjects, projectFundingAllocations: [], investments, investmentRequests, transactions, fieldLogs, notifications, audit, projectAllocations: [], financialEntries: [], legalDocuments: [], supportMessages: [] };
}
