import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Confirmation gate for consequential account, finance, and publishing actions. */
export default function ConfirmAction({
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName = "",
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  disabled = false,
  onConfirm,
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await onConfirm?.();
      if (result !== false) setOpen(false);
    } finally {
      setPending(false);
    }
  };
  return <>
    <Button type="button" size={triggerSize} className={triggerClassName} variant={triggerVariant} disabled={disabled || pending} onClick={() => setOpen(true)}>
      {TriggerIcon && <TriggerIcon className="mr-1.5 h-3.5 w-3.5" />}{triggerLabel}
    </Button>
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl ${destructive ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-1 leading-6">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={confirm}>
            {pending ? "Please wait…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
