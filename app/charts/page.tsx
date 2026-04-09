import { redirect } from "next/navigation"

/**
 * The Charts page is now consolidated into the Indexes page.
 * All chart widgets (TTO, PIX, Fastmarkets) are available in /indexes.
 */
export default function ChartsPage() {
  redirect("/indexes")
}
