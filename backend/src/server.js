import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

let server;
try {
  await connectDatabase();
  server = app.listen(env.port, () => {
    console.log(`Premium Agro API running at http://localhost:${env.port}`);
    console.log(`Health check: http://localhost:${env.port}/api/v1/health`);
  });
} catch (error) {
  console.error(`Backend startup failed: ${error.message}`);
  process.exitCode = 1;
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down Premium Agro API...`);
  if (server) {
    const closed = new Promise((resolve) => server.close(resolve));
    // Long-lived Server-Sent Event connections otherwise keep a local Ctrl+C
    // shutdown waiting indefinitely. Closing them is safe during server shutdown.
    server.closeAllConnections?.();
    await closed;
  }
  await disconnectDatabase();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
