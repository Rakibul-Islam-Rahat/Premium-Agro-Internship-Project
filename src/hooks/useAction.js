import { useState } from "react";
import { toast } from "sonner";

// Wraps an async action with a pending flag and success/error toasts.
export function useAction(fn, success) {
  const [pending, setPending] = useState(false);
  const run = async (...args) => {
    setPending(true);
    try {
      const out = await fn(...args);
      if (success) toast.success(typeof success === "function" ? success(out) : success);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setPending(false);
    }
  };
  return [run, pending];
}
