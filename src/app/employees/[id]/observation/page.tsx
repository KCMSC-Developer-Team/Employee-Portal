import { redirect } from "next/navigation";

export default async function AddObservation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/employees/${id}`);
}
