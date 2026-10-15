// Known variations in the stock book, mapped to one canonical value.
// Everything here was seen in the source file; nothing is guessed beyond it.
// Lookups go through `aliasKey`, so case, spacing, punctuation and accents do not matter.

export function aliasKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Item names and SKU spellings used across the Stock and Jobs sheets. SKUs map to themselves automatically. */
export const PRODUCT_ALIASES: Record<string, string[]> = {
  "POS-T2": ["POS terminal", "POS terminal 15in", "terminal"],
  "PRN-80": ["Printer 80mm", "Printer 80", "prn80", "receipt printer", "Receipt printer 80mm"],
  "PRN-K": ["Kitchen printer", "Kitchen printer (impact)"],
  "KDS-15": ["Kitchen display", "Kitchen display 15in"],
  "CDR-01": ["Cash drawer"],
  "PAY-A9": ["Card reader", "PDQ"],
  "RTR-4G": ["router", "4G router"],
  "CBL-ETH": ["ethernet cable", "Ethernet cable 5m", "Cables", "Cable"],
  "PSU-24": ["PSU", "printer PSU", "Printer power supply 24V"],
  "PAP-80": ["Paper", "Paper 80mm", "Thermal paper 80mm"],
};

/**
 * Technicians as written in the book. Full names combine the Vans sheet ("K. Mansour")
 * with the first names used in the Jobs sheet and the email thread ("Khalid").
 */
export const TECHNICIANS: { name: string; aliases: string[] }[] = [
  { name: "Khalid Mansour", aliases: ["K. Mansour", "Khalid", "khalid m"] },
  { name: "Sami Rahal", aliases: ["S. Rahal", "Sami"] },
  { name: "Yusuf Idris", aliases: ["Y. Idris", "Yusuf"] },
  { name: "Pavel Horák", aliases: ["P. Horák", "P. Horak", "Pavel"] },
  { name: "Dan Whitfield", aliases: ["D. Whitfield", "Dan W", "Dan"] },
  { name: "Ahmed Nasser", aliases: ["A. Nasser", "Ahmed"] },
  { name: "Mike Okafor", aliases: ["M. Okafor", "Mike O", "Mike"] },
  { name: "Jonas Lindqvist", aliases: ["J. Lindqvist", "Jonas"] },
];

/** Customer names written differently. Raised as an INFO issue whenever applied. */
export const CUSTOMER_ALIASES: Record<string, string> = {
  // Arabic for "Zaytoun restaurant"; same Riverside branch as Zaytoun Grill.
  "مطعم زيتون": "Zaytoun Grill",
};

/** Words used instead of digits in the qty column. */
export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** What the vehicle column says when it means the pool van. */
export const POOL_VAN_WORDS = ["pool", "pool van"];

/**
 * Decisions the source states in prose rather than in a column. Each is applied
 * deliberately and raised as an INFO issue so it stays visible.
 */
export const IMPORT_DECISIONS = {
  /** Read me sheet: "V01 has been at the garage since 18/08. Khalid is in the pool van." */
  poolVanDriver: "Khalid Mansour",
  /**
   * Hub manager (email, 13 Oct): kitchen screens ship direct and should come off the
   * June minimum list. Nobody else has agreed, so automatic van restocking is off
   * provisionally and the policy is flagged for review. Stock and jobs are unaffected.
   */
  restockPolicyOverrides: {
    "KDS-15": {
      autoRestock: false,
      note: "Provisionally excluded from automatic van restocking: hub says kitchen displays ship direct. Needs an agreed decision.",
    },
  } as Record<string, { autoRestock: boolean; note: string }>,
};
