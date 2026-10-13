import { requirePermission } from "@/server/authz";
import { listReferenceData } from "@/server/staff/reference";
import { AddReferenceForm } from "./add-form";

export default async function ReferenceData() {
  await requirePermission("staff:update"); // institution-wide only
  const { departments, designations, categories } = await listReferenceData();
  const lists = [
    { kind: "department" as const, title: "Departments", label: "department", items: departments },
    { kind: "designation" as const, title: "Designations", label: "designation", items: designations },
    { kind: "category" as const, title: "Joined as (employment categories)", label: "category", items: categories },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reference data</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {lists.map((l) => (
          <section key={l.kind} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">{l.title}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {l.items.length === 0 && <li className="text-slate-500">None yet.</li>}
              {l.items.map((i) => <li key={i.id}>{i.name}</li>)}
            </ul>
            <AddReferenceForm kind={l.kind} label={l.label} />
          </section>
        ))}
      </div>
    </div>
  );
}
