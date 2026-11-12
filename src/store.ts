// Payments live in one JSON file. Enough for a single merchant counter; every write
// goes to a temp file first, then a rename, so a crash never leaves half a file.
import fs from "node:fs";
import path from "node:path";
import type { Payment } from "./payment-types.js";

export class PaymentStore {
  private readonly items = new Map<string, Payment>();

  constructor(private readonly file: string) {
    if (fs.existsSync(file)) {
      for (const p of JSON.parse(fs.readFileSync(file, "utf8")) as Payment[]) {
        // Payments saved before delivery targets existed all went to Stellar.
        p.delivery ??= { target: "stellar", recipient: "", assetId: "" };
        this.items.set(p.id, p);
      }
    }
  }

  get(id: string): Payment | undefined {
    return this.items.get(id);
  }

  all(): Payment[] {
    return [...this.items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  save(p: Payment): void {
    this.items.set(p.id, p);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.items.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }
}
