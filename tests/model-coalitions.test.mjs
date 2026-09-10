import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINES,
  BROAD_LEFT,
  DEFAULT_COALITIONS,
  DISTRICTS,
  LIKELY_COALITIONS,
  POLLING_THROUGH,
  districtLists,
  resultForDistrict,
} from "../app/model.ts";

function scenario(raw, undecided, mode, coalitions) {
  return {
    mode,
    raw,
    undecided,
    undecidedTurnout: 85,
    undecidedTilt: 0,
    localPersistence: 65,
    diasporaHdz: 3,
    minorityLeft: 4,
    coalitions,
    mergeHdzRight: false,
  };
}

function geographicSeats(model, members) {
  let seats = 0;
  for (const district of DISTRICTS) {
    for (const list of resultForDistrict(district, model).autoSeats) {
      if (list.split(" + ").some((party) => members.has(party))) seats += 1;
    }
  }
  return seats;
}

test("the custom builder starts with no hidden coalition partners", () => {
  assert.deepEqual(DEFAULT_COALITIONS, { left: [], hdz: [], right: [] });
});

test("the likely-blocs preset includes the SDP–Mozemo joint list", () => {
  assert.ok(LIKELY_COALITIONS.left.includes("Mozemo"));
  assert.ok(LIKELY_COALITIONS.hdz.includes("HSS"));
  assert.ok(!LIKELY_COALITIONS.left.includes("HSS"));
  assert.ok(!BROAD_LEFT.has("HSS"));
  assert.ok(!BROAD_LEFT.has("IDS"));
});

test("the embedded polling baseline includes the two August and September polls", () => {
  assert.equal(POLLING_THROUGH, "2026-09-06");
  assert.match(BASELINES.ipsos.label, /26 Aug 2026/);
  assert.match(BASELINES.promocija.label, /6 Sep 2026/);
});

test("current NPS and Fokus stronghold estimates remain below the district threshold", () => {
  const baseline = BASELINES.weighted;
  const model = scenario(baseline.vals, baseline.und, "polls", DEFAULT_COALITIONS);
  assert.ok(districtLists("III", model).NPS < 5);
  assert.ok(districtLists("VI", model).Fokus < 5);
});

test("an isolated SDP–Mozemo merger never loses seats on an embedded baseline", () => {
  for (const baseline of Object.values(BASELINES)) {
    const separate = scenario(baseline.vals, baseline.und, "polls", DEFAULT_COALITIONS);
    const together = scenario(baseline.vals, baseline.und, "left", DEFAULT_COALITIONS);
    const members = new Set(["SDP", "Mozemo"]);
    assert.ok(
      geographicSeats(together, members) >= geographicSeats(separate, members),
      `${baseline.label}: the joint list must not trail the same two separate lists`,
    );
  }
});
