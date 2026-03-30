import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { changedAt: "desc" },
    take: 200,
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Audit Trail</h1>
        <p className="text-sm text-gray-500 mt-1">{logs.length} entries</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium">Entity</th>
                <th className="text-left px-4 py-3 font-medium">Field</th>
                <th className="text-left px-4 py-3 font-medium">Month</th>
                <th className="text-left px-4 py-3 font-medium">Old</th>
                <th className="text-left px-4 py-3 font-medium">New</th>
                <th className="text-left px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                    {log.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium">{log.entity}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{log.field}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-400">
                    {log.month ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-red-600">
                    {log.oldValue ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-green-700 font-medium">
                    {log.newValue ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{log.changedBy}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-400 text-sm"
                  >
                    No audit entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}