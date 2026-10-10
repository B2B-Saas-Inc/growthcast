// Signed device cookie for the Positioning Wizard. The value names a device row; the HMAC stops tampering.
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "__Host-gc_wizard";
export const SESSION_SECONDS = 180 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const mac = (secret: string, payload: string) => createHmac("sha256", secret).update(`wizard:${payload}`).digest("hex");

export function signDevice(deviceId: string, secret: string, now = Date.now()) {
  if (!UUID.test(deviceId)) throw new Error("Invalid device id");
  const payload = `${deviceId}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return `${payload}.${mac(secret, payload)}`;
}

export function verifyDevice(value: string, secret: string, now = Date.now()): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [deviceId, expires, signature] = parts;
  if (!UUID.test(deviceId) || !/^\d{10}$/u.test(expires) || !/^[a-f0-9]{64}$/u.test(signature)) return null;
  if (Number(expires) <= Math.floor(now / 1000)) return null;
  const expected = Buffer.from(mac(secret, `${deviceId}.${expires}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? deviceId : null;
}

export function readCookie(header: string | undefined) {
  return (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1) ?? "";
}

export function cookieHeader(value: string, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
