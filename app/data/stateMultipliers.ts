// Regional grocery cost-of-living multipliers (1.0 = national average).
// Sources: USDA CNPP regional food price data, BLS regional CPI indices.

export const STATE_MULTIPLIERS: Record<string, number> = {
  AL: 0.90, AK: 1.35, AZ: 1.05, AR: 0.89, CA: 1.30,
  CO: 1.12, CT: 1.15, DE: 1.08, FL: 1.02, GA: 0.96,
  HI: 1.45, ID: 1.00, IL: 1.05, IN: 0.93, IA: 0.92,
  KS: 0.91, KY: 0.90, LA: 0.93, ME: 1.10, MD: 1.12,
  MA: 1.20, MI: 0.95, MN: 1.02, MS: 0.88, MO: 0.91,
  MT: 1.02, NE: 0.93, NV: 1.05, NH: 1.12, NJ: 1.18,
  NM: 0.95, NY: 1.22, NC: 0.95, ND: 0.94, OH: 0.93,
  OK: 0.90, OR: 1.12, PA: 1.02, RI: 1.12, SC: 0.93,
  SD: 0.94, TN: 0.91, TX: 0.96, UT: 1.02, VT: 1.10,
  VA: 1.05, WA: 1.15, WV: 0.90, WI: 0.96, WY: 0.98,
  DC: 1.25,
};

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington D.C.",
};

export const US_STATES = Object.entries(STATE_NAMES)
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(([value, label]) => ({ value, label }));
