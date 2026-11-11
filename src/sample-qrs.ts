// Demo merchant QRs, one per scheme, with made-up accounts. Used by the demo page and tests.
import { buildEmvQr, writeTlv } from "./emv-qr.js";

export const SAMPLE_QRS: Array<{ id: string; label: string; qr: string }> = [
  {
    id: "vn",
    label: "Vietnam, VietQR, 250,000 VND",
    qr: buildEmvQr({
      country: "VN",
      currency: "704",
      accountTag: "38",
      guid: "A000000727",
      account: [["01", writeTlv([["00", "970436"], ["01", "0011001234567"]])], ["02", "QRIBFTTA"]],
      amount: 250000,
      merchantName: "PHO GIA TRUYEN",
      merchantCity: "HA NOI",
    }),
  },
  {
    id: "th",
    label: "Thailand, PromptPay, amount typed by payer",
    qr: buildEmvQr({ country: "TH", currency: "764", accountTag: "29", guid: "A000000677010111", account: [["01", "0066812345678"]], merchantName: "SOMTAM CORNER", merchantCity: "BANGKOK" }),
  },
  {
    id: "ph",
    label: "Philippines, QR Ph, 450 PHP",
    qr: buildEmvQr({ country: "PH", currency: "608", accountTag: "27", guid: "com.p2pqrpay", account: [["01", "BOPIPHMM"], ["03", "109876543210"]], amount: 450, merchantName: "KAPE NI ANA", merchantCity: "MANILA" }),
  },
  {
    id: "id",
    label: "Indonesia, QRIS, 75,000 IDR",
    qr: buildEmvQr({ country: "ID", currency: "360", accountTag: "51", guid: "ID.CO.QRIS.WWW", account: [["02", "ID1020012345678"], ["03", "UMI"]], amount: 75000, merchantName: "WARUNG BU SRI", merchantCity: "JAKARTA" }),
  },
  {
    id: "br",
    label: "Brazil, Pix, 32.50 BRL",
    qr: buildEmvQr({ country: "BR", currency: "986", accountTag: "26", guid: "br.gov.bcb.pix", account: [["01", "lanchonete@example.com"]], amount: 32.5, merchantName: "LANCHONETE BOM", merchantCity: "SAO PAULO" }),
  },
];
