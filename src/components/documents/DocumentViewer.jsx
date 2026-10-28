import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { printElement } from "@/lib/print";

// doc = { title, node, autoPrint? }. Pass null to close.
export default function DocumentViewer({ doc, onClose }) {
  const ref = useRef(null);
  const print = () => ref.current && printElement(ref.current);
  useEffect(() => {
    if (!doc?.autoPrint) return undefined;
    const t = setTimeout(print, 500);
    return () => clearTimeout(t);
  }, [doc]);
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-3 space-y-0 border-b bg-background p-4 pr-12">
          <DialogTitle className="text-base">{doc?.title}</DialogTitle>
          <DialogDescription className="sr-only">Document preview</DialogDescription>
          <Button size="sm" onClick={print}><Printer className="mr-1.5 h-4 w-4" />Download PDF / Print</Button>
        </DialogHeader>
        <div ref={ref}>{doc?.node}</div>
      </DialogContent>
    </Dialog>
  );
}
