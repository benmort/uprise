import { createServer, Server } from "node:http";

export type WorkerQueueMetrics = {
  queue: string;
  completed: number;
  failed: number;
  active: number;
  waiting: number;
  delayed: number;
  stalled: number;
  lastError?: string;
};

export type WorkerHealthSnapshot = {
  startedAt: string;
  queues: WorkerQueueMetrics[];
};

export function createWorkerHealthServer(
  port: number,
  getSnapshot: () => WorkerHealthSnapshot,
): Server {
  const server = createServer((request, response) => {
    const url = request.url?.split("?")[0] || "";
    if (url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, workerStartedAt: getSnapshot().startedAt }));
      return;
    }
    if (url === "/metrics") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(getSnapshot()));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, message: "Not found" }));
  });

  server.listen(port);
  return server;
}
