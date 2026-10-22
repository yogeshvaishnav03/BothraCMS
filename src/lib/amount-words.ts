const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo99(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function upTo999(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? upTo99(rest) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in words, Indian style: 1234567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven". */
export function rupeesInWords(rupees: number): string {
  let n = Math.floor(Math.abs(rupees));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore > 999 ? rupeesInWords(crore) : upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (n) parts.push(upTo999(n));
  return parts.join(" ");
}

/** Paise → "Rupees ... and ... Paise Only". */
export function paiseInWords(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = Math.round(paise % 100);
  return `Rupees ${rupeesInWords(r)}${p ? ` and ${upTo99(p)} Paise` : ""} Only`;
}
