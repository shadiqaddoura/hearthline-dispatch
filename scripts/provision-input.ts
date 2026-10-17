import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { appendFile, readFile } from "node:fs/promises";
import { parse } from "dotenv";

/** Local terminal only: passwords never echo, enter argv, or get written to disk. */
export async function promptProvisioning(env: Record<string, string | undefined>) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Interactive setup requires a local terminal");
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  const ask = async (label: string, secret = false) => {
    process.stdout.write(label);
    hidden = secret;
    try { return await terminal.question(""); }
    finally { hidden = false; if (secret) process.stdout.write("\n"); }
  };
  process.stdout.write("Passwords must be distinct, at least 15 characters, and at most 1024 bytes. Press Ctrl+C to cancel.\n");
  const result = { ...env };
  try {
    const origin = result.AUTH_ORIGIN?.trim() || (await ask("Public app origin (saved locally in .env): ")).trim();
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin || (env.NODE_ENV === "production" && url.protocol !== "https:")) {
      throw new Error("Use an exact HTTP(S) origin; production requires HTTPS");
    }
    result.AUTH_ORIGIN = origin;
    for (const [prefix, label] of [["AUTH_ADMIN", "Admin"], ["AUTH_OPERATIONS", "Operations"]]) {
      result[`${prefix}_EMAIL`] ||= (await ask(`${label} email: `)).trim();
      result[`${prefix}_NAME`] ||= (await ask(`${label} display name (Enter for ${label}): `)).trim() || label;
      if (!result[`${prefix}_PASSWORD`]) {
        const password = await ask(`${label} password (hidden): `, true);
        const confirmation = await ask(`Confirm ${label} password (hidden): `, true);
        if (password !== confirmation) throw new Error("Password confirmation does not match");
        result[`${prefix}_PASSWORD`] = password;
      }
    }
    // Only public origin is persisted. Existing config and all account secrets stay untouched.
    if (!env.AUTH_ORIGIN?.trim()) {
      const current = await readFile(".env", "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return "";
      });
      if (!parse(current).AUTH_ORIGIN?.trim()) {
        await appendFile(".env", `\nAUTH_ORIGIN=${JSON.stringify(origin)}\n`, { mode: 0o600 });
      }
    }
    return result;
  } finally { terminal.close(); output.end(); }
}
