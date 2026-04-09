/**
 * widget-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared catalog for chart and index widgets:
 *   - INDEX_DISPLAY_NAMES  centralised friendly name mapping (raw → display)
 *   - displayNameForIndex  looks up a friendly name, falls back to the raw name
 *   - CHART_CATALOG        kept for reference / possible future use
 *   - INDEX_WIDGET_PREFIX / indexWidgetKey / indexNameFromKey  key helpers
 */

// ── Friendly display names ────────────────────────────────────────────────────

/**
 * Maps the exact IndexDefinition.name stored in the database to a shorter,
 * business-friendly label used in selectors and widget headings.
 *
 * Naming rules:
 *   - Keep the publisher abbreviation (FM, PIX, TTO, RISI)
 *   - Shorten grade/route to a 3–5 word phrase
 *   - Append "(spot)" when the original name contains "spot"
 */
export const INDEX_DISPLAY_NAMES: Record<string, string> = {
  // ── Fastmarkets ────────────────────────────────────────────────────────────
  "FM: PIX Pulp China NBSK Net":
    "PIX China NBSK Net",
  "FM: Pulp, bleached hardwood kraft, eucalyptus, delivered in place Brazil to US East/tonne":
    "US HW Delivered East Coast",
  "FM: Pulp, northern bleached softwood kraft (spot price), delivered US East/tonne":
    "NBSK Spot US East",
  "FM: Pulp, southern bleached softwood kraft (spot price), delivered US East/tonne":
    "SBSK Spot US East",
  "FM: Pulp, unbleached softwood kraft imports from Chile/North America (net price), cif China/tonne":
    "UKP Net CIF China",
  "FM: Pulp, unbleached softwood kraft, from Canada/US, delivered US East/tonne":
    "UKP Delivered US East",

  // ── PIX / RISI ─────────────────────────────────────────────────────────────
  "PIX China":        "PIX China BHK",
  "RISI Europe HW":   "RISI Europe HW",
  "RISI USA HW":      "RISI USA HW",

  // ── TTO ───────────────────────────────────────────────────────────────────
  "TTO":                    "TTO (generic)",
  "TTO China BHK":          "TTO China BHK",
  "TTO China NBSK":         "TTO China NBSK",
  "TTO Europe BHK":         "TTO Europe BHK",
  "TTO Europe NBSK":        "TTO Europe NBSK",
  "TTO Global UKP UKP":     "TTO Global UKP",
  "TTO North America BHK":  "TTO North America BHK",
  "TTO North America NBSK": "TTO North America NBSK",
  "TTO North America SBSK": "TTO North America SBSK",
}

/**
 * Returns the friendly display name for an IndexDefinition.name, falling back
 * to the raw name if no mapping is defined.
 */
export function displayNameForIndex(rawName: string): string {
  return INDEX_DISPLAY_NAMES[rawName] ?? rawName
}

// ── Charts page catalog (kept for reference) ──────────────────────────────────

export type ChartWidgetDef = {
  key: string
  label: string
  match: { exact: string } | { prefix: string }
}

/**
 * Note: the Charts page now redirects to /indexes.
 * This catalog is kept for reference only.
 */
export const CHART_CATALOG: ChartWidgetDef[] = [
  { key: "chart:pix-china",         label: "PIX China",         match: { exact: "PIX China" } },
  { key: "chart:tto-north-america", label: "TTO North America", match: { prefix: "TTO North America " } },
  { key: "chart:tto-china",         label: "TTO China",         match: { prefix: "TTO China " } },
  { key: "chart:tto-europe",        label: "TTO Europe",        match: { prefix: "TTO Europe " } },
  { key: "chart:tto-global-ukp",    label: "TTO Global UKP",    match: { prefix: "TTO Global UKP " } },
]

// ── Indexes page key helpers ───────────────────────────────────────────────────

/** Prefix used for index widget keys stored in PageLayout.widgetKey */
export const INDEX_WIDGET_PREFIX = "idx:"

export function indexWidgetKey(name: string): string {
  return `${INDEX_WIDGET_PREFIX}${name}`
}

export function indexNameFromKey(key: string): string {
  return key.slice(INDEX_WIDGET_PREFIX.length)
}
