import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

// Local Windows workaround for DNS SRV resolution failures seen with some
// Node.js/Windows resolver combinations. This does not affect production.
if (process.platform === "win32" && env.nodeEnv !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

export async function connectDatabase() {
  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is missing. Copy .env.example to .env and configure MongoDB Atlas first.");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 12000,
    maxPoolSize: 10,
    autoIndex: env.nodeEnv !== "production",
  });
  console.log(`MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
