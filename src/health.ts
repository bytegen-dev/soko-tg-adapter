import { createServer, type Server } from "node:http";

export function startHealthServer(port: number): Server {
  const server = createServer((request, response) => {
    if (request.url === "/health" || request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
      return;
    }
    response.writeHead(404);
    response.end();
  });

  server.listen(port, () => {
    console.log(`[health] listening on ${port}`);
  });

  return server;
}
