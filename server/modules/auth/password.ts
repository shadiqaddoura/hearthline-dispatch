import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP scrypt minimum: N=2^17, r=8, p=1 (~128 MiB per hash).
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 15 || Buffer.byteLength(password) > 1024) {
    throw new Error("Passwords must contain at least 15 characters and at most 1024 bytes");
  }
  const salt = randomBytes(16).toString("hex");
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
// No reusable credential: an unknown user still performs the same expensive hash.
const dummyHash = `scrypt$131072$8$1$${randomBytes(16).toString("hex")}$${randomBytes(64).toString("hex")}`;
export async function verifyPassword(password: string, stored = dummyHash): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash, extra] = stored.split("$");
  if (algorithm !== "scrypt" || n !== "131072" || r !== "8" || p !== "1" ||
      !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "") || extra !== undefined) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
