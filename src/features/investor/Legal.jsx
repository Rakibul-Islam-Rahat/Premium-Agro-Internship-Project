import { useState } from "react";
import { Download, Eye, FileText, Image as ImageIcon } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";
import { useDb } from "@/services/mock/store";

export default function Legal() {
  const documents = useDb((s) => s.legalDocuments ?? []);
  const [preview, setPreview] = useState(null);
  return <>
    <PageHeader title="Official Documents" description="View and download legal files manually published by Premium Agro administrators. Generated investment agreements are available only under My investments." />
    {documents.length ? <div className="grid gap-3 md:grid-cols-2">{documents.map((doc) => <Card key={doc.id}><CardContent className="flex h-full flex-col gap-3 p-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-muted p-3">{doc.type?.startsWith("image/") ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><h2 className="font-semibold">{doc.title}</h2><p className="text-xs text-muted-foreground">{doc.category} · {fmtDateTime(doc.uploadedAt)}</p><p className="mt-1 break-words text-sm text-muted-foreground">{doc.description || doc.name}</p></div></div><div className="mt-auto flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setPreview(doc)}><Eye className="mr-1.5 h-4 w-4" />View</Button><a className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent" href={doc.dataUrl} download={doc.name}><Download className="mr-1.5 h-4 w-4" />Download original</a></div></CardContent></Card>)}</div> : <EmptyState title="No official documents published yet" description="Published legal documents will appear here when an administrator uploads them." />}
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-h-[90vh] max-w-4xl overflow-auto"><DialogHeader><DialogTitle>{preview?.title ?? "Document preview"}</DialogTitle></DialogHeader>{preview && (preview.type === "application/pdf" ? <iframe title={preview.title} src={preview.dataUrl} className="h-[70vh] w-full rounded-md border" /> : <img src={preview.dataUrl} alt={preview.title} className="mx-auto max-h-[70vh] max-w-full object-contain" />)}{preview && <a className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm" href={preview.dataUrl} download={preview.name}><Download className="mr-2 h-4 w-4" />Download original file</a>}</DialogContent></Dialog>
  </>;
}
