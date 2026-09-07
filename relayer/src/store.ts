import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ProcessedRequestStore {
  has(id: string): boolean;
  add(id: string): void;
}

export class MemoryProcessedRequestStore implements ProcessedRequestStore {
  private readonly ids = new Set<string>();
  has(id: string): boolean {
    return this.ids.has(id);
  }
  add(id: string): void {
    this.ids.add(id);
  }
}

interface StoreFile {
  version: 1;
  processed: string[];
}

export class FileProcessedRequestStore implements ProcessedRequestStore {
  private readonly ids = new Set<string>();

  constructor(private readonly path: string) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as StoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.processed)) {
        throw new Error("unsupported processed-request store format");
      }
      for (const id of parsed.processed) {
        if (typeof id === "string") this.ids.add(id);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    this.ids.add(id);
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    // Write-then-rename avoids leaving a partially written JSON file if the process
    // stops during persistence.
    const temporary = `${this.path}.${process.pid}.tmp`;
    const body: StoreFile = { version: 1, processed: [...this.ids].sort() };
    writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}
