import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
export default async function Home() { const session = await currentSession(); redirect(session?.user ? "/dashboard" : "/login"); }
