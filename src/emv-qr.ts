// Reads any EMVCo merchant-presented QR: VietQR, PromptPay, QR Ph, QRIS, Pix and the
// other national schemes built on the same TLV format (id, 2-digit length, value).
import { crc16, isValidCrc } from "./vietqr.js";
import { countryByCode, countryByCurrency, type Country } from "./countries.js";

export type Tlv = Record<string, string>;

export function readTlv(payload: string): Tlv {
  const out: Tlv = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > payload.length) throw new QrError("QR data is cut short or malformed");
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  if (i !== payload.length) throw new QrError("QR data has trailing bytes");
  return out;
}

export function writeTlv(fields: Array<[string, string]>): string {
  return fields.map(([id, v]) => id + v.length.toString().padStart(2, "0") + v).join("");
}

export class QrError extends Error {}

export interface ParsedQr {
  country: Country;
  scheme: string;
  merchantName: string;
  merchantCity: string;
  amount: number | null; // in the QR's local currency, null when the payer types it
  account: string; // bank account, phone or payment key, as printed in the QR
  bankId: string; // bank BIN or institution code when the scheme carries one
}

const SCHEME_GUIDS: Array<{ match: RegExp; scheme: string }> = [
  { match: /^A000000727$/i, scheme: "VietQR (NAPAS 247)" },
  { match: /^A00000067701011[1-4]$/i, scheme: "PromptPay" },
  { match: /^(com\.p2pqrpay|ph\.ppmi\..*)$/i, scheme: "QR Ph" },
  { match: /^ID\.CO\..*$/i, scheme: "QRIS" },
  { match: /^br\.gov\.bcb\.pix$/i, scheme: "Pix" },
];

interface MerchantAccount {
  scheme: string;
  sub: Tlv;
}

function merchantAccounts(top: Tlv): MerchantAccount[] {
  const found: MerchantAccount[] = [];
  for (let id = 26; id <= 51; id++) {
    const raw = top[String(id)];
    if (!raw) continue;
    let sub: Tlv;
    try {
      sub = readTlv(raw);
    } catch {
      continue;
    }
    const guid = sub["00"] ?? "";
    const known = SCHEME_GUIDS.find((g) => g.match.test(guid));
    if (known) found.push({ scheme: known.scheme, sub });
  }
  return found;
}

function accountOf(acc: MerchantAccount): { account: string; bankId: string } {
  const { scheme, sub } = acc;
  if (scheme.startsWith("VietQR")) {
    const beneficiary = readTlv(sub["01"] ?? "");
    return { bankId: beneficiary["00"] ?? "", account: beneficiary["01"] ?? "" };
  }
  if (scheme === "Pix") return { bankId: "", account: sub["01"] ?? "" };
  if (scheme === "QRIS") return { bankId: sub["01"] ?? "", account: sub["02"] ?? sub["01"] ?? "" };
  // QR Ph: 01 is the bank code, the account follows in 03 or 04.
  if (scheme === "QR Ph") return { bankId: sub["01"] ?? "", account: sub["03"] ?? sub["04"] ?? "" };
  // PromptPay: 01 phone, 02 national id, 03 e-wallet id. One of them is present.
  return { bankId: "", account: sub["01"] ?? sub["02"] ?? sub["03"] ?? "" };
}

export function parseEmvQr(qr: string): ParsedQr {
  const payload = qr.trim();
  if (!isValidCrc(payload)) throw new QrError("Not a valid payment QR (checksum failed)");
  const top = readTlv(payload);
  if (top["00"] !== "01") throw new QrError("Not an EMVCo payment QR (format indicator missing)");

  const country = countryByCode(top["58"] ?? "") ?? countryByCurrency(top["53"] ?? "");
  if (!country) throw new QrError(`Country ${top["58"] ?? "?"} / currency ${top["53"] ?? "?"} is not supported yet`);

  const accounts = merchantAccounts(top);
  const primary = accounts[0];
  const { account, bankId } = primary ? accountOf(primary) : { account: "", bankId: "" };
  if (!account) throw new QrError("QR has no merchant account this app can pay");

  const amount = top["54"] ? Number(top["54"]) : null;
  if (amount !== null && !(amount > 0)) throw new QrError("QR amount is not a positive number");

  return {
    country,
    scheme: primary.scheme,
    merchantName: top["59"] ?? "",
    merchantCity: top["60"] ?? "",
    amount,
    account,
    bankId,
  };
}

// Builds a QR for tests and the demo. Real merchants print theirs from their bank app.
export function buildEmvQr(input: {
  country: string;
  currency: string;
  guid: string;
  account: Array<[string, string]>;
  accountTag?: string;
  amount?: number;
  merchantName?: string;
  merchantCity?: string;
}): string {
  const fields: Array<[string, string]> = [
    ["00", "01"],
    ["01", input.amount ? "12" : "11"],
    [input.accountTag ?? "26", writeTlv([["00", input.guid], ...input.account])],
    ["52", "0000"],
    ["53", input.currency],
  ];
  if (input.amount) fields.push(["54", String(input.amount)]);
  fields.push(["58", input.country]);
  if (input.merchantName) fields.push(["59", input.merchantName]);
  if (input.merchantCity) fields.push(["60", input.merchantCity]);
  const body = writeTlv(fields) + "6304";
  return body + crc16(body);
}

export function maskAccount(account: string): string {
  return account.length <= 4 ? account : "•••" + account.slice(-4);
}
