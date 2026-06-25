self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;
  if (event.data.type === "MYTITAN_OFFLINE_BINARY_SYNCED") {
    self.registration.showNotification?.("MyTitan offline evidence", {
      body: `${event.data.processed || 0} queued item(s) reached the server sync audit.`,
      tag: "mytitan-offline-sync",
      silent: true,
    }).catch(() => undefined);
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "mytitan-offline-binary-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "MYTITAN_RUN_OFFLINE_BINARY_SYNC" }));
    }),
  );
});
