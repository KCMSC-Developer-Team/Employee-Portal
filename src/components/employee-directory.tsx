"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Printer, Plus, Search, UserRound } from "lucide-react";
import { BulkDelete } from "@/components/bulk-delete";

type DirectoryEmployee = {
  id: string;
  userId: string | null;
  fullNameEnglish: string;
  fullNameBangla: string | null;
  employeeId: string | null;
  designation: string | null;
  department: string | null;
  mobile: string | null;
  personalEmail: string | null;
  user: { email: string } | null;
};

const sorts = [
  ["fullNameEnglish", "Sort: Name"],
  ["employeeId", "Sort: Employee ID"],
  ["designation", "Sort: Designation"],
  ["department", "Sort: Department"],
  ["createdAt", "Sort: Recently added"],
] as const;

export function EmployeeDirectory({
  role,
  ownUserId,
  initialQuery,
  initialSort,
  initialPage,
}: {
  role: string;
  ownUserId: string;
  initialQuery: string;
  initialSort: string;
  initialPage: number;
}) {
  const isStaff = ["DEVELOPER", "AUTHORITY", "COMPUTER_OPERATOR"].includes(role);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(initialPage);
  const [rows, setRows] = useState<DirectoryEmployee[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const normalizedQuery = query.trim();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timeout = window.setTimeout(async () => {
      const search = new URLSearchParams();
      if (normalizedQuery) search.set("q", normalizedQuery);
      search.set("sort", sort);
      search.set("page", String(page));
      const queryString = search.toString();
      router.replace(`/employees?${queryString}`, { scroll: false });
      try {
        const response = await fetch(`/api/employees?${queryString}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to search employees.");
        setRows(result.rows);
        setHasMore(result.hasMore);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to search employees.",
        );
        setRows([]);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery, sort, page, router]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-3.5 text-slate-400" />
          <input
            aria-label="Search employees"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search name, ID, designation or department"
            className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-emerald-700"
          />
        </div>
        <select
          aria-label="Sort employee results"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(0);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
        >
          {sorts.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Link
          href="/employees/print"
          className="hidden items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm sm:flex"
        >
          <Printer size={16} /> Print
        </Link>
      </div>

      {role === "DEVELOPER" && <BulkDelete employees={rows} />}
      {isStaff && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href="/employees/new"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Add employee
          </Link>
          <Link
            href="/employees/import"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"
          >
            <Download size={16} /> Import from Excel
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="font-semibold">Employee records</div>
            <div className="mt-1 text-xs text-slate-500">
              {loading ? "Searching…" : `${rows.length} records shown`}
            </div>
          </div>
          <div className="text-xs text-slate-400">100 results per page</div>
        </div>
        {error && (
          <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Employee ID</th>
                <th className="px-4 py-3 font-semibold">Designation</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-800">
                        <UserRound size={17} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">
                          {employee.fullNameEnglish || "Unnamed employee"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {employee.fullNameBangla || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">{employee.employeeId || "—"}</td>
                  <td className="px-4 py-4 text-slate-600">{employee.designation || "—"}</td>
                  <td className="px-4 py-4 text-slate-600">{employee.department || "—"}</td>
                  <td className="px-4 py-4">
                    <div className="text-slate-700">{employee.mobile || "—"}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {employee.personalEmail || employee.user?.email || "—"}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={
                        isStaff
                          ? `/employees/${employee.id}`
                          : employee.userId === ownUserId
                            ? "/my-profile"
                            : `/employees/${employee.id}/contact`
                      }
                      className="text-xs font-semibold text-emerald-800 hover:underline"
                    >
                      {isStaff
                        ? "View profile"
                        : employee.userId === ownUserId
                          ? "My profile"
                          : "Contact details"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-sm text-slate-500">
              No employees matched that search.
            </div>
          )}
          {loading && (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Searching employees…
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">Page {page + 1}</span>
          <button
            type="button"
            disabled={!hasMore || loading}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
