import { ResetForm } from "./form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      {token ? <ResetForm token={token} /> : <p className="mt-2 text-sm text-red-600">This reset link is invalid or has expired.</p>}
    </main>
  );
}
