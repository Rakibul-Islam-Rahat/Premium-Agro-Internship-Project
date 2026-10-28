import { connectDatabase, disconnectDatabase } from "../src/config/db.js";
import { Programme } from "../src/models/index.js";

const programme = {
  id: "p1",
  singletonKey: "premium-agro-collective",
  title: "Premium Agro Collective Investment Programme",
  category: "COLLECTIVE",
  location: "Selected farming locations across Bangladesh",
  targetAmount: 2_350_000_000,
  raisedAmount: 0,
  risk: "VARIABLE",
  status: "PAUSED",
  operationsStartedAt: null,
  progress: 0,
  stage: "Initial setup and compliance review",
  startDate: null,
  harvestDate: null,
  payment: {
    bank: "DEMO ONLY — replace with the verified Premium Agro organization account before launch",
    bankName: "Demo Bank — replace before launch",
    bankAccountName: "Premium Agro Demo Collection",
    bankAccountNumber: "DEMO-REPLACE-BEFORE-LAUNCH",
    bankBranch: "",
    bankVerified: false,
    bankVerifiedAt: null,
    bankVerifiedBy: null,
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
};

try {
  await connectDatabase();
  const existing = await Programme.findOne({ singletonKey: programme.singletonKey });
  if (existing) {
    console.log(`Programme already exists (${existing.id}); left unchanged.`);
  } else {
    await Programme.create(programme);
    console.log("Seeded the single Premium Agro collective programme in PAUSED state. Configure real bank details from the Admin panel before opening requests.");
  }
} catch (error) {
  console.error(`Programme seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
