import { describe, expect, it } from "vitest";
import {
  GSTR2B_EXTENSIONS,
  MAX_UPLOAD_MB,
  amountError,
  arnError,
  fileError,
  gstinShapeError,
  hsnError,
  invoiceDateError,
  invoiceDraftErrors,
  normalizeArn,
  normalizeGstin,
  partitionFiles,
  registrationErrors,
} from "./validate";

/** A File of a stated size without allocating the bytes for it. */
function sizedFile(name, bytes, type = "application/pdf") {
  const file = new File(["x"], name, { type });
  // File.size is read-only and derives from the parts; a 20 MB fixture built
  // honestly would allocate 20 MB per test.
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("fileError", () => {
  it("accepts a normal invoice", () => {
    expect(fileError(sizedFile("invoice.pdf", 400_000))).toBe("");
  });

  it("names the extension it will not read", () => {
    const message = fileError(sizedFile("scans.zip", 400_000));
    expect(message).toContain(".zip");
    expect(message).toContain(".pdf");
  });

  it("rejects a file with no extension at all", () => {
    expect(fileError(sizedFile("scan", 400_000))).toContain("no extension");
  });

  it("is case-insensitive about the extension", () => {
    // Phone cameras and scanners routinely emit .PDF and .JPG.
    expect(fileError(sizedFile("INVOICE.PDF", 400_000))).toBe("");
    expect(fileError(sizedFile("photo.JPEG", 400_000))).toBe("");
  });

  it("takes the last dot, not the first", () => {
    expect(fileError(sizedFile("april.2026.invoice.pdf", 1000))).toBe("");
    expect(fileError(sizedFile("invoice.pdf.exe", 1000))).not.toBe("");
  });

  it("refuses an empty file and says why it might be empty", () => {
    // Zero bytes reaches the parser as an empty document and comes back as
    // "no fields found", which reads like the extraction failed.
    expect(fileError(sizedFile("invoice.pdf", 0))).toContain("still be downloading");
  });

  it("refuses a file over the limit and states its actual size", () => {
    const message = fileError(sizedFile("scan.pdf", 41 * 1024 * 1024));
    expect(message).toContain("41.0 MB");
    expect(message).toContain(`${MAX_UPLOAD_MB} MB`);
  });

  it("accepts a file exactly on the limit", () => {
    // The server's check is `> max_bytes`, so the boundary must match or the
    // browser refuses a file the API would have taken.
    expect(fileError(sizedFile("scan.pdf", MAX_UPLOAD_MB * 1024 * 1024))).toBe("");
  });

  it("applies the GSTR-2B list when given it", () => {
    expect(fileError(sizedFile("2b.json", 5000), { extensions: GSTR2B_EXTENSIONS })).toBe("");
    // The portal hands the 2B out as a zip, which is the usual mistake here.
    expect(
      fileError(sizedFile("2b.zip", 5000), { extensions: GSTR2B_EXTENSIONS }),
    ).toContain(".json");
    // A PDF is a fine invoice but not a fine 2B.
    expect(
      fileError(sizedFile("2b.pdf", 5000), { extensions: GSTR2B_EXTENSIONS }),
    ).not.toBe("");
  });

  it("says something useful when there is no file", () => {
    expect(fileError(null)).toBe("No file selected.");
  });
});

describe("partitionFiles", () => {
  it("keeps the good files and reports each bad one", () => {
    const { accepted, rejected } = partitionFiles([
      sizedFile("a.pdf", 1000),
      sizedFile("b.zip", 1000),
      sizedFile("c.jpg", 1000),
    ]);

    // The whole point: one bad file must not cancel the batch.
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf", "c.jpg"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].file.name).toBe("b.zip");
    expect(rejected[0].error).toContain(".zip");
  });

  it("handles an empty selection", () => {
    expect(partitionFiles(null).accepted).toEqual([]);
    expect(partitionFiles(undefined).rejected).toEqual([]);
  });
});

describe("normalizeGstin", () => {
  it("strips the separators a paste from a PDF carries", () => {
    expect(normalizeGstin("27 AAPFU0939F 1ZV")).toBe("27AAPFU0939F1ZV");
    expect(normalizeGstin("27-aapfu0939f1zv")).toBe("27AAPFU0939F1ZV");
  });

  it("survives null", () => {
    expect(normalizeGstin(null)).toBe("");
  });
});

describe("gstinShapeError", () => {
  it("passes a well-formed GSTIN", () => {
    expect(gstinShapeError("27AAPFU0939F1ZV")).toBe("");
  });

  it("treats empty as the caller's business, not an error", () => {
    // Clearing the field on the invoice form is a legitimate edit.
    expect(gstinShapeError("")).toBe("");
    expect(gstinShapeError(null)).toBe("");
  });

  it("counts the characters it actually got", () => {
    expect(gstinShapeError("27AAPFU0939F1Z")).toContain("14");
  });

  it("rejects a digit where the PAN letters belong", () => {
    expect(gstinShapeError("27AAPF00939F1ZV")).toContain("format");
  });

  it("rejects a missing Z in the fourteenth position", () => {
    expect(gstinShapeError("27AAPFU0939F1XV")).toContain("format");
  });

  it("rejects 00 as a state code", () => {
    // The usual result of a leading digit being eaten on paste.
    expect(gstinShapeError("00AAPFU0939F1ZV")).toContain("state code");
  });

  it("does not judge the check digit", () => {
    // Deliberate: the checksum lives on the server, and a second
    // implementation of that arithmetic is how the two come to disagree.
    // This GSTIN is correctly shaped but checksum-invalid, and passes here.
    expect(gstinShapeError("27AAPFU0939F1ZZ")).toBe("");
  });

  it("normalizes before judging", () => {
    expect(gstinShapeError("27 aapfu0939f 1zv")).toBe("");
  });
});

describe("amountError", () => {
  it("accepts blank, which clears the field", () => {
    expect(amountError("")).toBe("");
    expect(amountError(null)).toBe("");
  });

  it("accepts ordinary amounts", () => {
    expect(amountError("0")).toBe("");
    expect(amountError("1234.56")).toBe("");
    expect(amountError(".5")).toBe("");
  });

  it("rejects a negative, matching the server's ge=0", () => {
    expect(amountError("-1", "CGST")).toBe("CGST cannot be negative.");
  });

  it("rejects text", () => {
    expect(amountError("12oo")).toContain("must be a number");
    expect(amountError("1,234")).toContain("must be a number");
  });

  it("rejects a lone dot or minus", () => {
    expect(amountError(".")).toContain("must be a number");
    expect(amountError("-")).toContain("must be a number");
  });

  it("rejects more precision than the column holds", () => {
    // Numeric(14, 2) silently rounds a third decimal, producing a total the
    // user never typed.
    expect(amountError("100.005")).toContain("paise");
    expect(amountError("100.00")).toBe("");
  });

  it("rejects an amount too large for the column", () => {
    expect(amountError("1000000000000")).toContain("too large");
  });

  it("labels the field it was given", () => {
    expect(amountError("-5", "Taxable value")).toContain("Taxable value");
  });
});

describe("invoiceDateError", () => {
  const today = new Date(2026, 4, 20); // 20 May 2026, local time.

  it("accepts a past date", () => {
    expect(invoiceDateError("2026-04-15", { today })).toBe("");
  });

  it("accepts today", () => {
    expect(invoiceDateError("2026-05-20", { today })).toBe("");
  });

  it("rejects tomorrow", () => {
    // A future-dated invoice lands in a period that cannot be filed yet, and
    // then reconciles as missing from the 2B every month until someone looks.
    expect(invoiceDateError("2026-05-21", { today })).toContain("future");
  });

  it("rejects a date before GST existed", () => {
    expect(invoiceDateError("2017-06-30", { today })).toContain("1 July 2017");
    expect(invoiceDateError("2017-07-01", { today })).toBe("");
  });

  it("rejects a day that does not exist", () => {
    expect(invoiceDateError("2026-02-30", { today })).toContain("does not exist");
    expect(invoiceDateError("2026-13-01", { today })).toContain("does not exist");
  });

  it("rejects a non-ISO string", () => {
    expect(invoiceDateError("15/04/2026", { today })).toContain("YYYY-MM-DD");
  });

  it("accepts blank", () => {
    expect(invoiceDateError("", { today })).toBe("");
  });

  it("does not shift the day near midnight in a positive-offset zone", () => {
    // The comparison is string-on-string against an ISO date for this reason:
    // parsing to Date drags the browser's timezone in, and in IST a date typed
    // late in the evening can read as tomorrow in UTC and be refused.
    const lateEvening = new Date(2026, 4, 20, 23, 45);
    expect(invoiceDateError("2026-05-20", { today: lateEvening })).toBe("");
  });
});

describe("hsnError", () => {
  it("accepts the real code lengths", () => {
    expect(hsnError("8471")).toBe("");
    expect(hsnError("847130")).toBe("");
    expect(hsnError("84713010")).toBe("");
    expect(hsnError("84")).toBe("");
  });

  it("rejects letters", () => {
    expect(hsnError("84A1")).toContain("digits only");
  });

  it("rejects more than the column holds", () => {
    expect(hsnError("123456789")).toContain("8 digits");
  });

  it("rejects a single digit", () => {
    expect(hsnError("8")).toContain("at least 2");
  });

  it("accepts blank", () => {
    expect(hsnError("")).toBe("");
  });
});

describe("invoiceDraftErrors", () => {
  const today = new Date(2026, 4, 20);

  function draft(overrides = {}) {
    return {
      counterparty_gstin: "27AAPFU0939F1ZV",
      counterparty_name: "Acme Supplies",
      invoice_number: "INV-1",
      invoice_date: "2026-04-15",
      hsn_code: "8471",
      taxable_value: "1000",
      cgst: "90",
      sgst: "90",
      igst: "",
      cess: "",
      total_value: "1180",
      ...overrides,
    };
  }

  it("passes a clean draft with no warnings", () => {
    const { errors, warnings } = invoiceDraftErrors(draft(), { today });
    expect(errors).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("keys each error to its field", () => {
    const { errors } = invoiceDraftErrors(
      draft({ cgst: "-1", invoice_date: "2027-01-01", hsn_code: "abc" }),
      { today },
    );
    expect(Object.keys(errors).sort()).toEqual(["cgst", "hsn_code", "invoice_date"]);
  });

  it("enforces the server's max lengths", () => {
    const { errors } = invoiceDraftErrors(
      draft({ invoice_number: "x".repeat(65), counterparty_name: "y".repeat(256) }),
      { today },
    );
    expect(errors.invoice_number).toContain("64");
    expect(errors.counterparty_name).toContain("255");
  });

  it("warns when a supply is both interstate and intrastate", () => {
    const { errors, warnings } = invoiceDraftErrors(
      draft({ igst: "180", cgst: "90", sgst: "90", total_value: "1360" }),
      { today },
    );
    // A warning, not an error: it must still be savable, because a credit note
    // adjusting a supply booked the other way legitimately looks like this.
    expect(errors).toEqual({});
    expect(warnings.join(" ")).toContain("interstate or intrastate");
  });

  it("warns when CGST and SGST differ", () => {
    const { warnings } = invoiceDraftErrors(draft({ cgst: "90", sgst: "80" }), { today });
    expect(warnings.join(" ")).toContain("normally equal");
  });

  it("warns when the total does not add up", () => {
    const { warnings } = invoiceDraftErrors(draft({ total_value: "5000" }), { today });
    expect(warnings.join(" ")).toContain("5000.00");
  });

  it("tolerates rounding of a rupee in the total", () => {
    // Line-level rounding on a real invoice is legal and routine.
    expect(invoiceDraftErrors(draft({ total_value: "1180.50" }), { today }).warnings).toEqual([]);
  });

  it("does not warn about arithmetic on a field that is already wrong", () => {
    // Otherwise a half-typed amount produces "the total does not add up" on
    // every keystroke, on top of the real message.
    const { errors, warnings } = invoiceDraftErrors(draft({ cgst: "9o" }), { today });
    expect(errors.cgst).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it("treats an all-blank draft as valid", () => {
    // Every field is optional on the server; blanks clear them.
    const blank = Object.fromEntries(Object.keys(draft()).map((k) => [k, ""]));
    expect(invoiceDraftErrors(blank, { today }).errors).toEqual({});
  });
});

describe("registrationErrors", () => {
  const good = {
    gstin: "27AAPFU0939F1ZV",
    legal_name: "Acme Supplies Pvt Ltd",
    email: "owner@acmesupplies.in",
    password: "correct horse battery",
  };

  it("passes a complete form", () => {
    expect(registrationErrors(good)).toEqual({});
  });

  // The form sets `noValidate`, which turns off the input's own `type="email"`
  // check along with the required-field bubbles it was disabled for. Without a
  // rule here, registering with the box empty was a round trip that came back
  // as a generic 400 pointing at no field in particular.
  it("requires an email", () => {
    expect(registrationErrors({ ...good, email: "" }).email).toBe("Enter your email.");
  });

  it("treats whitespace as empty", () => {
    expect(registrationErrors({ ...good, email: "   " }).email).toBe("Enter your email.");
  });

  it("requires an email to be shaped like one", () => {
    expect(registrationErrors({ ...good, email: "owner" }).email).toContain("does not look like");
    expect(registrationErrors({ ...good, email: "owner@acme" }).email).toContain(
      "does not look like",
    );
  });

  it("accepts the addresses a real business registers with", () => {
    // The shape check is a subset of the server's, so it must not refuse
    // anything the server would take. Plus-addressing and a multi-label host
    // are the two that a stricter regex usually gets wrong.
    for (const email of [
      "owner+gst@acmesupplies.in",
      "a.b@mail.co.in",
      "OWNER@ACME.IN",
    ]) {
      expect(registrationErrors({ ...good, email })).toEqual({});
    }
  });

  it("requires a GSTIN", () => {
    expect(registrationErrors({ ...good, gstin: "" }).gstin).toContain("required");
  });

  it("passes the shape complaint through", () => {
    expect(registrationErrors({ ...good, gstin: "27AAPFU" }).gstin).toContain("15 characters");
  });

  it("requires a legal name, since it appears on the returns", () => {
    expect(registrationErrors({ ...good, legal_name: "   " }).legal_name).toContain("required");
  });

  it("enforces the server's password minimum", () => {
    expect(registrationErrors({ ...good, password: "short" }).password).toContain("8 characters");
    expect(registrationErrors({ ...good, password: "12345678" }).password).toBeUndefined();
  });
});


describe("arnError", () => {
  it("accepts the portal's 15-character acknowledgement", () => {
    expect(arnError("AA270426000000X")).toBe("");
  });

  it("accepts one typed with the spaces the acknowledgement prints", () => {
    expect(arnError("AA2704 26000000 X")).toBe("");
  });

  it("accepts a lower-cased one, since the server folds it", () => {
    expect(arnError("aa270426000000x")).toBe("");
  });

  it("treats a blank field as acceptable rather than missing", () => {
    // The acknowledgement is often not to hand when someone marks a return
    // done, and refusing the record without it would leave the deadline alert
    // firing for a return that is genuinely filed.
    for (const blank of ["", "   ", null, undefined]) {
      expect(arnError(blank)).toBe("");
    }
  });

  it("refuses punctuation, which no ARN carries", () => {
    expect(arnError("AA2704-2600-0000")).toContain("letters and digits");
  });

  it("refuses something far too short or too long to be one", () => {
    expect(arnError("AB12")).toContain("does not look like an ARN");
    expect(arnError("A".repeat(33))).toContain("does not look like an ARN");
  });

  it("stays as loose as the server's own pattern at both ends", () => {
    // Mirrors ARN_PATTERN in app/services/filing.py. Too strict is the harmful
    // direction: it locks a business out of recording a filing that happened.
    expect(arnError("A".repeat(10))).toBe("");
    expect(arnError("A".repeat(32))).toBe("");
    expect(arnError("A".repeat(9))).not.toBe("");
  });
});

describe("normalizeArn", () => {
  it("strips whitespace and upper-cases", () => {
    expect(normalizeArn(" aa2704 26000000 x ")).toBe("AA270426000000X");
  });

  it("gives the empty string for nothing, so a caller can omit the field", () => {
    // An absent ARN means "not to hand" on the server and leaves a stored one
    // alone; an empty string is not an ARN and would be refused.
    expect(normalizeArn("")).toBe("");
    expect(normalizeArn(null)).toBe("");
    expect(normalizeArn("   ")).toBe("");
  });
});
