const clients = new Set();

export function subscribeToSnapshotEvents(res, user) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const client = { res, userId: user.id };
  clients.add(client);
  res.write(": connected\n\n");

  // Heartbeats keep idle event streams open through common local/proxy timeouts.
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      clients.delete(client);
      return;
    }
    try { res.write(": heartbeat\n\n"); }
    catch { clearInterval(heartbeat); clients.delete(client); }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(client);
  };
  res.once("close", cleanup);
  res.once("error", cleanup);
  return cleanup;
}

export function broadcastSnapshotChanged() {
  const event = "event: snapshot.changed\ndata: {}\n\n";
  for (const client of clients) {
    const { res } = client;
    if (res.destroyed || res.writableEnded) {
      clients.delete(client);
      continue;
    }
    try { res.write(event); }
    catch { clients.delete(client); }
  }
}
