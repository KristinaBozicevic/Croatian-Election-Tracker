import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, localeOf, otherLabel, translate } from "../app/i18n.ts";

test("the language helpers provide Croatian, German, and English copy", () => {
  assert.equal(translate("hr", "Mandati i koalicije", "Sitze und Koalitionen"), "Mandati i koalicije");
  assert.equal(translate("de", "Mandati i koalicije", "Sitze und Koalitionen"), "Sitze und Koalitionen");
  assert.equal(translate("en", "Mandati i koalicije", "Sitze und Koalitionen"), "Seats & coalitions");
  assert.equal(otherLabel("Other", "en"), "Other");
  assert.equal(localeOf("en"), "en-GB");
  assert.match(formatDate("2026-09-06", "en"), /Sep/);
});
