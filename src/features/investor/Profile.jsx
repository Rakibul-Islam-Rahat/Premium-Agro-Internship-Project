import { useState } from "react";
import { Camera, UserRound } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, SelectInput, TextArea, TextInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GENDER } from "@/config/labels";
import { useAction } from "@/hooks/useAction";
import { api } from "@/services/api";
import { imageToDataUrl } from "@/lib/image";
import { emptyKyc, emptyProfile } from "@/services/mock/seed";
import { usePortfolio } from "./hooks";

const GENDERS = [{ value: "", label: "Select" }, ...Object.entries(GENDER).map(([value, label]) => ({ value, label }))];
const DIVISIONS = ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh"];

const merge = (base, over) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v && typeof v === "object" ? merge(v, over?.[k] ?? {}) : over?.[k] ?? v]));
const setIn = (obj, path, val) => (path.length === 1 ? { ...obj, [path[0]]: val } : { ...obj, [path[0]]: setIn(obj[path[0]], path.slice(1), val) });

export default function Profile() {
  const { user } = usePortfolio();
  const [profile, setProfile] = useState(() => merge(emptyProfile(), user.profile));
  const [kyc, setKyc] = useState(() => merge(emptyKyc(), user.kyc));
  const [bank, setBank] = useState({ accName: "", accNum: "", bankName: "", branch: "", ...user.bank });
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [avatarError, setAvatarError] = useState("");
  const [docError, setDocError] = useState("");
  const [sameAddr, setSameAddr] = useState(false);
  const locked = user.kyc.status === "PENDING" || user.kyc.status === "VERIFIED";
  const p = (path) => ({ value: path.reduce((o, k) => o[k], profile), disabled: locked, onChange: (e) => setProfile((x) => setIn(x, path, e.target.value)) });
  const k = (key) => ({ value: kyc[key], disabled: locked, onChange: (e) => setKyc((x) => ({ ...x, [key]: e.target.value })) });
  const doc = (key) => ({ disabled: locked, onChange: async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setDocError("");
    try {
      let selected;
      if (file.type.startsWith("image/")) {
        selected = await imageToDataUrl(file, { maxBytes: 160 * 1024, maxDimension: 1400 });
      } else if (file.type === "application/pdf" && key !== "photo") {
        if (file.size > 300 * 1024) throw new Error("PDF identity documents must be 300 KB or smaller in local demo mode. Use an image scan or reduce the PDF size.");
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read this document. Please try again."));
          reader.readAsDataURL(file);
        });
        selected = { name: file.name, caption: file.name, type: file.type, dataUrl };
      } else {
        throw new Error(key === "photo" ? "Upload a JPG, PNG, or WebP photo." : "Upload an image or PDF identity document.");
      }
      setKyc((x) => ({ ...x, docs: { ...x.docs, [key]: selected } }));
    } catch (error) {
      setDocError(error.message || "The selected document could not be processed.");
      input.value = "";
    }
  } });
  const submit = () => api.submitKyc(user.id, { kyc: { nid: kyc.nid, tin: kyc.tin, passport: kyc.passport, docs: kyc.docs }, profile: sameAddr ? setIn(profile, ["address", "permanent"], profile.address.present) : profile });
  const [submitKyc, kp] = useAction(submit, "KYC information submitted for verification");
  const [saveBank, bp] = useAction(() => api.updateProfile(user.id, { bank }), "Bank details saved");
  const [saveAvatar, ap] = useAction(() => api.updateProfile(user.id, { avatar }), "Profile photo saved");
  const chooseAvatar = (e) => {
    const file = e.target.files?.[0];
    setAvatarError("");
    if (!file) return;
    imageToDataUrl(file, { maxBytes: 240 * 1024, maxDimension: 960 }).then((image) => setAvatar(image.dataUrl)).catch((error) => setAvatarError(error.message));
  };
  const Doc = ({ id, label }) => {
    const current = kyc.docs[id];
    const hasFile = current && typeof current === "object" && typeof current.dataUrl === "string";
    const hint = hasFile ? `Ready to submit: ${current.name}` : typeof current === "string" && current ? `Previous sample name only (${current}); select a real file to submit.` : (id === "photo" ? "JPG, PNG or WebP; image is compressed before saving." : "Image scan up to 5 MB, or PDF up to 300 KB in local demo mode.");
    return <Labeled label={label} hint={hint}>
      <input type="file" accept={id === "photo" ? "image/*" : "image/*,application/pdf"} className="block w-full text-sm" {...doc(id)} />
    </Labeled>;
  };

  return (
    <>
      <PageHeader title="Profile & KYC" description={`${user.name} • ${user.email} • ${user.phone}`} actions={<StatusBadge status={user.kyc.status} />} />
      {user.kyc.status === "PENDING" && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Your information has been submitted for verification. It cannot be edited until verification is complete.</p>}
      {user.kyc.status === "REJECTED" && <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">Your KYC application was rejected. Edit the information and submit it again.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Profile Photo</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-100 bg-emerald-50 text-emerald-800">{avatar ? <img src={avatar} alt={`${user.name} profile`} className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10" />}</div>
          <div className="flex-1"><Labeled label="Upload a profile image" hint="JPG, PNG or WebP; maximum original size 5 MB. The image is compressed before saving."><input type="file" accept="image/*" onChange={chooseAvatar} className="block w-full text-sm" /></Labeled>{avatarError && <p role="alert" className="mt-1 text-sm text-red-600">{avatarError}</p>}<p className="mt-2 text-xs text-muted-foreground">This is a profile picture, separate from your identity-document photo used for KYC.</p></div>
          <Button disabled={ap || !!avatarError || !avatar} onClick={saveAvatar}><Camera className="mr-2 h-4 w-4" />{ap ? "Saving…" : "Save photo"}</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Father Name"><TextInput {...p(["fatherName"])} /></Labeled>
            <Labeled label="Mother Name"><TextInput {...p(["motherName"])} /></Labeled>
            <Labeled label="Date of Birth"><TextInput type="date" max={new Date().toISOString().slice(0, 10)} {...p(["dob"])} /></Labeled>
            <Labeled label="Gender"><SelectInput options={GENDERS} {...p(["gender"])} /></Labeled>
            <Labeled label="Occupation"><TextInput {...p(["occupation"])} /></Labeled>
            <Labeled label="Nationality"><TextInput {...p(["nationality"])} /></Labeled>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Labeled label="Current Address"><TextArea {...p(["address", "present"])} /></Labeled></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" disabled={locked} checked={sameAddr} onChange={(e) => setSameAddr(e.target.checked)} />Permanent address is the same as current address</label>
            {!sameAddr && <div className="sm:col-span-2"><Labeled label="Permanent Address"><TextArea {...p(["address", "permanent"])} /></Labeled></div>}
            <Labeled label="District"><TextInput {...p(["address", "district"])} /></Labeled>
            <Labeled label="Division"><SelectInput options={DIVISIONS} {...p(["address", "division"])} /></Labeled>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Identity Verification</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Labeled label="National ID Number"><TextInput inputMode="numeric" {...k("nid")} /></Labeled>
            <Labeled label="TIN (optional)"><TextInput inputMode="numeric" {...k("tin")} /></Labeled>
            <Labeled label="Passport Number (optional)"><TextInput {...k("passport")} /></Labeled>
            <div />
            <Doc id="nidFront" label="National ID — Front" /><Doc id="nidBack" label="National ID — Back" />
            <Doc id="photo" label="Recent passport-size photo" />
            {docError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{docError}</p>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Nominee Information</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Nominee Name" hint="The nominee is always the investor’s father."><TextInput value={profile.fatherName} readOnly disabled /></Labeled>
            <Labeled label="Relationship"><TextInput value="Father" readOnly disabled /></Labeled>
            <Labeled label="Nominee Date of Birth"><TextInput type="date" {...p(["nominee", "dob"])} /></Labeled>
            <Labeled label="National ID / Birth Registration Number"><TextInput inputMode="numeric" {...p(["nominee", "nid"])} /></Labeled>
            <Labeled label="Mobile Number" hint="e.g. 01712345678"><TextInput inputMode="tel" {...p(["nominee", "phone"])} /></Labeled>
            <Labeled label="Nominee Address"><TextInput {...p(["nominee", "address"])} /></Labeled>
          </CardContent></Card>
        {!locked && <div className="lg:col-span-2"><ConfirmAction triggerLabel={kp ? "Submitting…" : "Submit for Verification"} disabled={kp} title="Submit your identity information?" description="This submits your personal details and identity documents for administrator review. Check that the information is accurate and that the front and back of your National ID and your recent photo are correct. You cannot edit the KYC submission while it is pending or after approval." confirmLabel="Submit identity documents" onConfirm={() => submitKyc()} /></div>}
        <Card><CardHeader><CardTitle className="text-base">Bank Details for Receiving Profit</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Labeled label="Account Holder Name"><TextInput value={bank.accName} onChange={(e) => setBank({ ...bank, accName: e.target.value })} /></Labeled>
            <Labeled label="Account Number"><TextInput value={bank.accNum} onChange={(e) => setBank({ ...bank, accNum: e.target.value })} /></Labeled>
            <Labeled label="Bank Name"><TextInput value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} maxLength={160} /></Labeled>
            <Labeled label="Branch Name (optional)"><TextInput value={bank.branch ?? ""} onChange={(e) => setBank({ ...bank, branch: e.target.value })} maxLength={160} /></Labeled>
            <div><Button disabled={bp} onClick={saveBank}>Save bank details</Button></div>
          </CardContent></Card>
      </div>
    </>
  );
}
