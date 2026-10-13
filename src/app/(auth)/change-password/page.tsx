import { requireUser } from "@/server/authz";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Set a new password</h1>
      <p className="mb-4 text-sm text-slate-600">
        {user.mustChangePassword ? "You must change your temporary password before continuing." : "Change your password."}
      </p>
      <ChangePasswordForm />
    </main>
  );
}
