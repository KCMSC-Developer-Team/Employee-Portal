import { ProfileValue } from "@/components/profile-value";
import type { ProfileChange } from "@/lib/profile-changes";

export function RequestComparison({ changes }: { changes: ProfileChange[] }) {
  if (!changes.length) {
    return (
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No effective changes were found. This request cannot be approved as an empty update.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="w-[24%] px-4 py-3">Field</th>
              <th className="w-[38%] px-4 py-3">Current information</th>
              <th className="w-[38%] px-4 py-3">Proposed information</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map((change, index) => (
              <tr key={`${change.field}-${index}`}>
                <th scope="row" className="break-words px-4 py-3 align-top font-medium text-slate-700">
                  {change.field}
                </th>
                <td className="break-words px-4 py-3 align-top text-slate-600">
                  <ProfileValue value={change.current} />
                </td>
                <td className="break-words bg-emerald-50/70 px-4 py-3 align-top font-medium text-emerald-950">
                  <ProfileValue value={change.proposed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {changes.map((change, index) => (
          <article
            key={`${change.field}-${index}`}
            className="overflow-hidden rounded-xl border border-slate-200"
          >
            <h3 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              {change.field}
            </h3>
            <div className="grid gap-3 p-4">
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">
                  Current information
                </div>
                <div className="break-words text-sm text-slate-700">
                  <ProfileValue value={change.current} />
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <div className="mb-1 text-xs font-semibold text-emerald-800">
                  Proposed information
                </div>
                <div className="break-words text-sm font-medium text-emerald-950">
                  <ProfileValue value={change.proposed} />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
