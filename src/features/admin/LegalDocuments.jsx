import { useRef, useState } from "react";
import { Download, Eye, FileText, Image as ImageIcon, UploadCloud } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Labeled, SelectInput, TextArea, TextInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { fmtDateTime } from "@/lib/format";
import { api } from "@/services/api";
import { useDb } from "@/services/mock/store";

const CATEGORIES = ["LEGAL", "POLICY", "DISCLOSURE", "FORM", "OTHER"].map((value) => ({ value, label: ({ LEGAL: "Legal agreement", POLICY: "Policy", DISCLOSURE: "Disclosure", FORM: "Form", OTHER: "Other official document" })[value] }));
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("The selected file could not be read.")); reader.readAsDataURL(file); });
}

export default function LegalDocuments() {
  const { user } = useAuth();
  const documents = useDb((s) => s.legalDocuments ?? []);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("LEGAL");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [save, saving] = useAction(async () => {
    if (!file) throw new Error("Select a PDF or document photo first.");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && file.type !== "application/pdf") throw new Error("Upload a PDF, JPG, PNG, or WebP file.");
    if (file.size > 1.5 * 1024 * 1024) throw new Error("This frontend demo accepts documents up to 1.5 MB. Production should use managed private file storage.");
    const dataUrl = await readAsDataUrl(file);
    await api.uploadLegalDocument(user.id, { title, category, description, file: { name: file.name, type: file.type, dataUrl } });
    setTitle(""); setCategory("LEGAL"); setDescription(""); setFile(null); setError("");
    const input = document.getElementById("legal-upload-file"); if (input) input.value = "";
  }, "Official document published to the investor document library");
  const [remove, removing] = useAction((id) => api.deleteLegalDocument(user.id, id), "Official document deleted");
  const doSave = async () => { setError(""); const result = await save(); if (!result) setError("Check the form fields and selected file, then try again."); };
  return <>
    <PageHeader title="Official Documents" description="Administrators manually publish approved legal files and photos. Investors can view and download the original uploaded file." />
    <Card className="mb-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UploadCloud className="h-5 w-5" />Upload an official document</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <Labeled label="Document title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Investment terms and conditions" /></Labeled>
      <Labeled label="Category"><SelectInput value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} /></Labeled>
      <div className="sm:col-span-2"><Labeled label="Description (optional)"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Describe the document, version or effective date." /></Labeled></div>
      <div className="sm:col-span-2"><Labeled label="Upload PDF or document photo" hint="PDF, JPG, PNG or WebP · 1.5 MB maximum in this demo · upload the approved original file; the system will not generate legal documents."><input id="legal-upload-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full rounded-md border p-2 text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} /></Labeled>{file && <p className="mt-2 text-sm">Selected: <b>{file.name}</b> ({Math.ceil(file.size / 1024)} KB)</p>}{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div>
      <div className="sm:col-span-2"><Button disabled={saving || title.trim().length < 3 || !file} onClick={doSave}><UploadCloud className="mr-2 h-4 w-4" />{saving ? "Publishing…" : "Publish official document"}</Button></div>
    </CardContent></Card>
    <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Published documents</h2><p className="text-sm text-muted-foreground">{documents.length} document(s) · visible to authenticated investors and admins</p></div></div>
    {documents.length ? <div className="grid gap-3 md:grid-cols-2">{documents.map((doc) => <Card key={doc.id}><CardContent className="flex h-full flex-col gap-3 p-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-muted p-3">{doc.type?.startsWith("image/") ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">{doc.title}</h3><p className="text-xs text-muted-foreground">{doc.category} · {fmtDateTime(doc.uploadedAt)}</p><p className="mt-1 break-words text-sm text-muted-foreground">{doc.description || doc.name}</p><p className="mt-1 text-xs text-muted-foreground">Uploaded by {doc.uploadedByName ?? "Administrator"}</p></div></div><div className="mt-auto flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setPreview(doc)}><Eye className="mr-1.5 h-4 w-4" />View</Button><a className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent" href={doc.dataUrl} download={doc.name}><Download className="mr-1.5 h-4 w-4" />Download original</a><div className="ml-auto"><ConfirmAction triggerLabel={removing ? "Deleting…" : "Delete"} destructive disabled={removing} title="Delete this official document?" description="The document will be removed from the demo's shared document library. Production should retain an auditable archive where required by law." confirmLabel="Delete document" onConfirm={() => remove(doc.id)} /></div></div></CardContent></Card>)}</div> : <EmptyState title="No official documents uploaded" description="Upload an approved PDF or photo using the form above." />}
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-h-[90vh] max-w-4xl overflow-auto"><DialogHeader><DialogTitle>{preview?.title ?? "Document preview"}</DialogTitle></DialogHeader>{preview && (preview.type === "application/pdf" ? <iframe title={preview.title} src={preview.dataUrl} className="h-[70vh] w-full rounded-md border" /> : <img src={preview.dataUrl} alt={preview.title} className="mx-auto max-h-[70vh] max-w-full object-contain" />)}{preview && <a className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm" href={preview.dataUrl} download={preview.name}><Download className="mr-2 h-4 w-4" />Download original file</a>}</DialogContent></Dialog>
  </>;
}
