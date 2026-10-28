import { connectDatabase, disconnectDatabase } from "../src/config/db.js";
import { AgroProject, Programme } from "../src/models/index.js";

const defaults = [
  {
    id: "agp-livestock", title: "Livestock & Cattle Fattening", category: "LIVESTOCK",
    location: "Bangladesh — operating location set by management",
    summary: "Livestock procurement, feed management, veterinary care and sales.",
    description: "This operating project covers livestock procurement, animal identification, feed planning, veterinary checks, routine health monitoring, weight measurements and the eventual sale process. Field managers submit dated evidence and measurements. Investors participate only through the pooled Premium Agro programme; this is not a separate investment product.",
    stage: "Planning and farm preparation", status: "PLANNING", progress: 0,
  },
  {
    id: "agp-orchards", title: "Mango & Seasonal Fruit Orchards", category: "ORCHARD",
    location: "Bangladesh — operating location set by management",
    summary: "Orchard preparation, irrigation, pest management and fruit sales.",
    description: "This operating project covers orchard maintenance, irrigation planning, pruning, pollination and fruit-set observations, pest management, harvest estimates and recorded sales. Field updates may include dated photos and agronomic notes. Project results contribute to the pooled programme's overall financial outcomes.",
    stage: "Planning and land assessment", status: "PLANNING", progress: 0,
  },
  {
    id: "agp-crops", title: "Seasonal Crop Cultivation", category: "CROPS",
    location: "Bangladesh — operating location set by management",
    summary: "Seed and input planning, cultivation, harvest and market records.",
    description: "This operating project covers seasonal crop planning, land preparation, seed and input records, planting, irrigation, crop-health observations, harvest estimates and market sales. Field managers record dated updates and evidence. Actual performance depends on weather, operating costs, yields and market conditions.",
    stage: "Season and input planning", status: "PLANNING", progress: 0,
  },
  {
    id: "agp-dairy", title: "Dairy & Animal Rearing", category: "DAIRY",
    location: "Bangladesh — operating location set by management",
    summary: "Animal care, feeding, veterinary monitoring and dairy operations.",
    description: "This operating project covers dairy and animal-rearing operations, feed records, animal health, veterinary treatment, milk/production records where applicable, equipment maintenance and recorded sales. Updates remain pending until administrator review, after which they become visible to programme investors.",
    stage: "Planning and readiness checks", status: "PLANNING", progress: 0,
  },
  {
    id: "agp-other", title: "Other Approved Agro Activities", category: "OTHER",
    location: "Bangladesh — assigned per approved activity",
    summary: "Additional documented agricultural activities approved by management.",
    description: "Use this project only for additional agricultural activities that management has explicitly approved and documented. The project description, location, start/end dates, allocated programme capital, financial entries and approved field updates must be kept current. Investors do not select this as a separate investment product.",
    stage: "Pending approved activity plan", status: "PLANNING", progress: 0,
  },
];

try {
  await connectDatabase();
  const programme = await Programme.findOne({ singletonKey: "premium-agro-collective" }).lean();
  if (!programme) throw new Error("The pooled programme is missing. Run npm run seed:programme first.");
  let created = 0;
  for (const item of defaults) {
    const exists = await AgroProject.exists({ id: item.id });
    if (exists) continue;
    const titleExists = await AgroProject.exists({ programmeId: programme.id, title: item.title });
    if (titleExists) continue;
    await AgroProject.create({ ...item, programmeId: programme.id, createdBy: "SYSTEM_SEED", updatedBy: "SYSTEM_SEED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    created += 1;
  }
  console.log(created ? `Seeded ${created} underlying agro projects under ${programme.title}.` : "Underlying agro projects already exist; left unchanged.");
} catch (error) {
  console.error(`Underlying project seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
