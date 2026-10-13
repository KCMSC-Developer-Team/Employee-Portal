"use client";

import { useActionState } from "react";
import { cancelRequestAction, type CancelState } from "./actions";

export function CancelButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelRequestAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="text-sm text-red-700 underline disabled:opacity-60">Cancel request</button>
      {state.error && <span role="alert" className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
