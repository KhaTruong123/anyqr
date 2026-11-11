import { test } from "node:test";
import assert from "node:assert/strict";
import { maskAccount, parseEmvQr, QrError } from "../src/emv-qr.js";
import { SAMPLE_QRS } from "../src/sample-qrs.js";

const GAIAN_SANDBOX_VIETQR = "00020101021238570010A00000072701270006970436011310230203300000208QRIBFTTA5303704540735000005802VN630449D2";
const sample = (id: string) => SAMPLE_QRS.find((s) => s.id === id)!.qr;

test("reads a real-format VietQR: bank BIN, account, amount in VND", () => {
  const p = parseEmvQr(GAIAN_SANDBOX_VIETQR);
  assert.equal(p.country.code, "VN");
  assert.equal(p.country.currency, "VND");
  assert.equal(p.scheme, "VietQR (NAPAS 247)");
  assert.equal(p.bankId, "970436");
  assert.equal(p.account, "1023020330000");
  assert.equal(p.amount, 3500000);
});

test("reads one sample QR per country scheme", () => {
  const expected: Record<string, [string, string, number | null, string]> = {
    vn: ["VN", "VietQR (NAPAS 247)", 250000, "0011001234567"],
    th: ["TH", "PromptPay", null, "0066812345678"],
    ph: ["PH", "QR Ph", 450, "109876543210"],
    id: ["ID", "QRIS", 75000, "ID1020012345678"],
    br: ["BR", "Pix", 32.5, "lanchonete@example.com"],
  };
  for (const [id, [country, scheme, amount, account]] of Object.entries(expected)) {
    const p = parseEmvQr(sample(id));
    assert.equal(p.country.code, country, id);
    assert.equal(p.scheme, scheme, id);
    assert.equal(p.amount, amount, id);
    assert.equal(p.account, account, id);
  }
});

test("rejects a QR whose checksum does not match", () => {
  const tampered = sample("vn").replace("250000", "950000");
  assert.throws(() => parseEmvQr(tampered), QrError);
});

test("rejects text that is not a payment QR", () => {
  assert.throws(() => parseEmvQr("https://example.com"), QrError);
});

test("masks all but the last 4 characters of an account", () => {
  assert.equal(maskAccount("0011001234567"), "•••4567");
  assert.equal(maskAccount("123"), "123");
});
