import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/index.js";
import { newId } from "../src/utils/security.js";

try {
  if (!env.bootstrapSuperAdminEmail || !/^\S+@\S+\.\S+$/.test(env.bootstrapSuperAdminEmail)) throw new Error("Set BOOTSTRAP_SUPERADMIN_EMAIL in backend/.env before running this script.");
  if (env.bootstrapSuperAdminPassword.length < 14) throw new Error("Set BOOTSTRAP_SUPERADMIN_PASSWORD to a strong, unique password of at least 14 characters.");
  await connectDatabase();
  const existing = await User.findOne({ role: "MAIN_ADMIN" });
  if (existing) throw new Error(`A SuperAdmin already exists (${existing.email}). No account was changed.`);
  const emailTaken = await User.exists({ email: env.bootstrapSuperAdminEmail });
  if (emailTaken) throw new Error("The configured SuperAdmin email already belongs to another account. Choose a unique email.");
  const name = env.bootstrapSuperAdminName.trim() || "Premium Agro SuperAdmin";
  const user = await User.create({
    id: newId("superadmin"), name, email: env.bootstrapSuperAdminEmail,
    passwordHash: await bcrypt.hash(env.bootstrapSuperAdminPassword, 12), role: "MAIN_ADMIN",
    phone: "", avatar: "", autoReinvest: false,
    profile: { fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi", address: { present: "", permanent: "", district: "", division: "" }, nominee: { name: "", relation: "Father", dob: "", nid: "", phone: "", address: "" } },
    kyc: { status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } },
    bank: { accName: name, accNum: "", bankName: "", branch: "" },
    accountStatus: "ACTIVE", approvalStatus: "APPROVED", registrationFlow: false,
    approval: { mainAdminApprovedAt: new Date().toISOString(), mainAdminApprovedBy: "BOOTSTRAP" },
    createdAt: new Date().toISOString(),
  });
  console.log(`Created the first SuperAdmin account (${user.email}). Keep the password private and remove bootstrap credentials from .env after setup.`);
} catch (error) {
  console.error(`SuperAdmin seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
