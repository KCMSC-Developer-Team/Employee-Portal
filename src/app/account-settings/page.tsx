import { requireUser } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";
export default async function AccountSettingsPage(){const s=await requireUser();return <Shell role={s.user?.role||"EMPLOYEE"} email={s.user?.email||""}><PageHeading eyebrow="Your account" title="Account settings" description="Manage your sign-in credentials. All employees should replace their initial employee-ID password."/><ChangePasswordForm/></Shell>}
