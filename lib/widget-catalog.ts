/**
 * widget-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Static catalogue of available widgets for the Charts and Indexes pages.
 *
 * Chart widgets map to TTO/PIX index groups only.
 * Fastmarkets data is not exposed as chart widgets (index values only).
 */

// ── Charts page ───────────────────────────────────────────────────────────────

export type ChartWidgetDef = {
  key: string
  label: string
  /** Match logic used by the server to build the ChartGroup for this widget. */
  match: { exact: string } | { prefix: string }
}

export const CHART_CATALOG: ChartWidgetDef[] = [
  { key: "chart:pix-china",         label: "PIX China",         match: { exact: "PIX China" } },
  { key: "chart:tto-north-america", label: "TTO North America", match: { prefix: "TTO North America " } },
  { key: "chart:tto-china",         label: "TTO China",         match: { prefix: "TTO China " } },
  { key: "chart:tto-europe",        label: "TTO Europe",        match: { prefix: "TTO Europe " } },
  { key: "chart:tto-global-ukp",    label: "TTO Global UKP",    match: { prefix: "TTO Global UKP " } },
]

// ── Indexes page ──────────────────────────────────────────────────────────────

/** Prefix used for index widget keys. widgetKey = "idx:" + IndexDefinition.name */
export const INDEX_WIDGET_PREFIX = "idx:"

export function indexWidgetKey(name: string): string {
  return `${INDEX_WIDGET_PREFIX}${name}`
}

export function indexNameFromKey(key: string): string {
  return key.slice(INDEX_WIDGET_PREFIX.length)
}
