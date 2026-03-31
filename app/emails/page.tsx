import { prisma } from "@/lib/prisma"
import { generateAllDrafts, markSent, updateBody } from "./actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

const CURRENT_MONTH = "2026-03"

const statusStyle: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  draft_ready: "bg-amber-100 text-amber-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  corrected: "bg-purple-100 text-purple-700",
  resent: "bg-indigo-100 text-indigo-700",
}

export default async function EmailsPage() {
  const drafts = await prisma.emailDraft.findMany({
    where: { month: CURRENT_MONTH },
    include: {
      cycle: { include: { market: true } },
      agent: true,
      customer: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Email Drafts</h1>
          <p className="text-sm text-gray-500 mt-1">April 2025</p>
        </div>
        <form action={generateAllDrafts}>
          <input type="hidden" name="month" value={CURRENT_MONTH} />
          <button
            type="submit"
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            ⚡ Generate All Drafts
          </button>
        </form>
      </div>

      {drafts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400 text-sm">
            No email drafts for {CURRENT_MONTH}. Click Generate All Drafts to create them.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {drafts.map((draft) => (
          <Card key={draft.id}>
            <CardHeader className="pb-0 pt-4 px-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{draft.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    To: {(JSON.parse(draft.recipientsTo as string) as string[]).join(", ")}
                    {(JSON.parse(draft.recipientsCc as string) as string[]).length > 0 &&
                      ` · CC: ${(JSON.parse(draft.recipientsCc as string) as string[]).join(", ")}`}
                    {" · "}
                    {draft.cycle.market.name}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusStyle[draft.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {draft.status.replace("_", " ")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <form action={updateBody} className="mb-3">
                <input type="hidden" name="draftId" value={draft.id} />
                <textarea
                  name="body"
                  defaultValue={draft.body}
                  rows={Math.min(draft.body.split("\n").length + 1, 20)}
                  className="w-full font-mono text-xs border border-gray-200 rounded-md p-3 bg-gray-50 resize-y focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="submit"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Save edits
                  </button>
                </div>
              </form>

              <div className="flex gap-2 items-center">
                {draft.status !== "sent" && draft.status !== "confirmed" && (
                  <form action={markSent}>
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button
                      type="submit"
                      className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
                    >
                      Mark as Sent
                    </button>
                  </form>
                )}
                {draft.sentAt && (
                  <span className="text-xs text-gray-400">
                    Sent: {draft.sentAt.toISOString().slice(0, 10)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

