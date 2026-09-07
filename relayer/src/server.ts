import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { relayerConfigFromEnv } from "./config";
import {
  PrivaraRelayerService,
  RelayerError,
  type SettlementEnvelope,
  type SweepRequest,
} from "./service";
import { FileProcessedRequestStore } from "./store";

const MAX_BODY_BYTES = 16 * 1024;

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RelayerError("request body is too large", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RelayerError("request body must be valid JSON");
  }
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

/** Build the HTTP adapter separately so live acceptance can exercise the real routes. */
export function createRelayerHttpServer(service: PrivaraRelayerService) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        respond(response, 200, { ok: true, network: service.config.network });
        return;
      }
      if (request.method === "GET" && request.url === "/v1/stealth/sponsor-policy") {
        respond(response, 200, service.sponsorPolicy());
        return;
      }
      if (request.method !== "POST") throw new RelayerError("route not found", 404, "not_found");
      const body = await jsonBody(request);
      if (request.url === "/v1/intents/settle") {
        respond(response, 202, await service.settleIntent(body as SettlementEnvelope));
        return;
      }
      if (request.url === "/v1/stealth/sponsor") {
        respond(response, 202, await service.sponsorSweep(body as SweepRequest));
        return;
      }
      throw new RelayerError("route not found", 404, "not_found");
    } catch (error) {
      const known = error instanceof RelayerError;
      const status = known ? error.status : 500;
      const code = known ? error.code : "internal_error";
      respond(response, status, {
        error: code,
        message: known ? error.message : "internal relayer error",
      });
      if (!known) console.error(error);
    }
  });
}

export function startRelayerServerFromEnv() {
  const service = new PrivaraRelayerService(
    relayerConfigFromEnv(),
    undefined,
    new FileProcessedRequestStore(
      process.env.PRIVARA_PROCESSED_STORE ?? ".privara/relayer-processed.json"
    )
  );
  const port = Number(process.env.PORT ?? "8787");
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error("PORT is invalid");
  const server = createRelayerHttpServer(service);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Privara relayer listening on http://127.0.0.1:${port}`);
  });
  return server;
}

// Importing this module for tests/acceptance must not unexpectedly open port 8787.
const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entrypoint === import.meta.url) startRelayerServerFromEnv();
