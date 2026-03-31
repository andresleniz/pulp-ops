import { prisma } from "@/lib/prisma"
import { markSent, updateBody, deleteDraft } from "./actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import EmailComposer from "./EmailComposer"

const statusStyle: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  draft_ready: "bg-amber-100 text-amber-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  corrected: "bg-purple-100 text-purple-700",
  resent: "bg-indigo-100 text-indigo-700",
}

export default async function EmailsPage() {
  const [markets, allContacts, fibers, drafts] = await Promise.all([
    prisma.market.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, defaultGreeting: true, defaultCc: true } }),
    prisma.marketContact.findMany({ orderBy: { name: "asc" } }),
    prisma.fiber.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
    prisma.emailDraft.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        cycle: { include: { market: true } },
        agent: true,
        customer: true,
      },
    }),
  ])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Email Drafts</h1>
        <p className="text-sm text-gray-500 mt-1">Generate and manage pricing emails per market</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: composer + contacts */}
        <div className="col-span-1">
          <EmailComposer markets={markets} allContacts={allContacts} fibers={fibers} />
        </div>

        {/* Right: drafts list */}
        <div className="col-span-2 space-y-4">
          {drafts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-gray-400 text-sm">
                No drafts yet. Use the composer to generate one.
              </CardContent>
            </Card>
          )}

          {drafts.map((draft) => {
            const toList = JSON.parse(draft.recipientsTo as string) as string[]
            const ccList = JSON.parse(draft.recipientsCc as string) as string[]
            return (
              <Card key={draft.id}>
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{draft.subject}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {draft.cycle.market.name}
                        {" · "}To: {toList.join(", ")}
                        {ccList.length > 0 && ` · CC: ${ccList.join(", ")}`}
                        {" · "}{draft.month}
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
                    <button type="submit" className="text-xs text-blue-600 hover:underline mt-1">
                      Save edits
                    </button>
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
                    <form action={deleteDraft.bind(null, draft.id)} className="ml-auto">
                      <button
                        type="submit"
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
