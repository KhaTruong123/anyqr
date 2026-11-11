// Countries whose bank QR codes Gaian can pay out to. The demo rates are round numbers
// for mock mode only; live quotes come from Gaian.
export interface Country {
  code: string; // ISO 3166 alpha-2, EMVCo tag 58
  currencyNumeric: string; // ISO 4217 numeric, EMVCo tag 53
  currency: string;
  name: string;
  demoRatePerUsdc: number;
  decimals: number;
}

export const COUNTRIES: Country[] = [
  { code: "VN", currencyNumeric: "704", currency: "VND", name: "Vietnam", demoRatePerUsdc: 26000, decimals: 0 },
  { code: "TH", currencyNumeric: "764", currency: "THB", name: "Thailand", demoRatePerUsdc: 33, decimals: 2 },
  { code: "PH", currencyNumeric: "608", currency: "PHP", name: "Philippines", demoRatePerUsdc: 58, decimals: 2 },
  { code: "ID", currencyNumeric: "360", currency: "IDR", name: "Indonesia", demoRatePerUsdc: 16000, decimals: 0 },
  { code: "BR", currencyNumeric: "986", currency: "BRL", name: "Brazil", demoRatePerUsdc: 5.5, decimals: 2 },
  { code: "AR", currencyNumeric: "032", currency: "ARS", name: "Argentina", demoRatePerUsdc: 1000, decimals: 2 },
  { code: "CO", currencyNumeric: "170", currency: "COP", name: "Colombia", demoRatePerUsdc: 4000, decimals: 2 },
  { code: "PE", currencyNumeric: "604", currency: "PEN", name: "Peru", demoRatePerUsdc: 3.8, decimals: 2 },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code.toUpperCase());
export const countryByCurrency = (numeric: string) => COUNTRIES.find((c) => c.currencyNumeric === numeric);
