import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVietQr, crc16, isValidCrc } from "../src/vietqr.js";

const SANDBOX_SAMPLE = "00020101021238570010A00000072701270006970436011310230203300000208QRIBFTTA5303704540735000005802VN630449D2";

test("CRC matches the Gaian sandbox sample QR", () => {
  assert.equal(crc16(SANDBOX_SAMPLE.slice(0, -4)), "49D2");
  assert.ok(isValidCrc(SANDBOX_SAMPLE));
});

test("built QR has a valid checksum and carries the amount", () => {
  const qr = buildVietQr({ bankBin: "970436", accountNumber: "9990000001", amountVnd: 900000, note: "DEMO" });
  assert.ok(isValidCrc(qr));
  assert.ok(qr.includes("5406900000"));
  assert.ok(qr.startsWith("000201010212"));
});

test("a tampered QR fails the checksum", () => {
  const qr = buildVietQr({ bankBin: "970436", accountNumber: "9990000001", amountVnd: 900000 });
  assert.equal(isValidCrc(qr.replace("900000", "100000")), false);
});
