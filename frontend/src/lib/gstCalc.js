const GST_SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 18, 40];

export { GST_SLABS };

export function calculate(amount, rate, { interstate = false } = {}) {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;

  const taxable = Math.round(amount * 100) / 100;
  const totalTax = Math.round(taxable * rate) / 100;

  if (interstate) {
    return {
      taxable,
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      cess: 0,
      total: Math.round((taxable + totalTax) * 100) / 100,
      rate,
      interstate: true,
    };
  }

  const half = Math.round((totalTax / 2) * 100) / 100;
  const otherHalf = Math.round((totalTax - half) * 100) / 100;
  return {
    taxable,
    cgst: half,
    sgst: otherHalf,
    igst: 0,
    cess: 0,
    total: Math.round((taxable + half + otherHalf) * 100) / 100,
    rate,
    interstate: false,
  };
}

export function reverseCalculate(totalWithTax, rate, { interstate = false } = {}) {
  if (!Number.isFinite(totalWithTax) || totalWithTax < 0) return null;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;

  const taxable = Math.round((totalWithTax / (1 + rate / 100)) * 100) / 100;
  return calculate(taxable, rate, { interstate });
}

export function formatINR(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calcUrl(amount, rate, interstate) {
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(amount));
  if (rate !== undefined) params.set("rate", String(rate));
  if (interstate) params.set("type", "igst");
  const suffix = params.toString();
  return `/calculator${suffix ? `?${suffix}` : ""}`;
}

export function parseCalcParams(search) {
  const params = new URLSearchParams(search);
  const amount = parseFloat(params.get("amount") || "");
  const rate = parseFloat(params.get("rate") || "");
  const interstate = params.get("type") === "igst";
  return {
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null,
    interstate,
  };
}
