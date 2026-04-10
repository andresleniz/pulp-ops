import { redirect } from "next/navigation"

export default function IndexChartsRedirect() {
  redirect("/pricing/charts")
}
