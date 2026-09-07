import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileProcessedRequestStore } from "../relayer/src/store";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("durable relayer request store", () => {
  it("retains accepted request IDs across service restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "privara-relayer-"));
    directories.push(directory);
    const path = join(directory, "processed.json");
    const first = new FileProcessedRequestStore(path);
    expect(first.has("request-a")).toBe(false);
    first.add("request-a");
    const restarted = new FileProcessedRequestStore(path);
    expect(restarted.has("request-a")).toBe(true);
  });
});
