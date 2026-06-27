"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Trash2, Upload } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from "@yarns/ui";
import { profile, type UserAvatarResponse, type UserProfileResponse } from "@yarns/api-client";
import { useToast } from "@/components/ui/toast";
import { getSession } from "@/lib/session";
import { AvatarCropper } from "@/components/profile/avatar-cropper";

type Form = {
  displayName: string;
  givenName: string;
  familyName: string;
  phone: string;
  bio: string;
  dateOfBirth: string;
  facebookUrl: string;
  twitterUrl: string;
  linkedinUrl: string;
  instagramUrl: string;
  websiteUrl: string;
};

const emptyForm: Form = {
  displayName: "",
  givenName: "",
  familyName: "",
  phone: "",
  bio: "",
  dateOfBirth: "",
  facebookUrl: "",
  twitterUrl: "",
  linkedinUrl: "",
  instagramUrl: "",
  websiteUrl: "",
};

/** Self-service profile (prog parity, yarns conventions): identity card, avatars, personal info. */
export default function ProfilePage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [superAdmin, setSuperAdmin] = useState(false);
  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [avatars, setAvatars] = useState<UserAvatarResponse[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    const [session, profileRes, avatarsRes] = await Promise.all([
      getSession(),
      profile.get(),
      profile.listAvatars(),
    ]);
    setEmail(session?.email ?? null);
    setRole(session?.role ?? "");
    setSuperAdmin(session?.isSuperAdmin ?? false);
    if (!profileRes.ok) {
      setError(profileRes.error);
      setLoading(false);
      return;
    }
    setData(profileRes.data);
    setForm({
      displayName: profileRes.data.displayName ?? "",
      givenName: profileRes.data.givenName ?? "",
      familyName: profileRes.data.familyName ?? "",
      phone: profileRes.data.phone ?? "",
      bio: profileRes.data.bio ?? "",
      dateOfBirth: profileRes.data.dateOfBirth ? profileRes.data.dateOfBirth.slice(0, 10) : "",
      facebookUrl: profileRes.data.facebookUrl ?? "",
      twitterUrl: profileRes.data.twitterUrl ?? "",
      linkedinUrl: profileRes.data.linkedinUrl ?? "",
      instagramUrl: profileRes.data.instagramUrl ?? "",
      websiteUrl: profileRes.data.websiteUrl ?? "",
    });
    if (avatarsRes.ok) setAvatars(avatarsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAvatar = avatars.find((a) => a.isSelected) ?? null;

  const save = async () => {
    setSaving(true);
    // Keep a real name on the topbar: fall back to given+family when display name is blank.
    const composed =
      form.displayName.trim() || [form.givenName, form.familyName].map((s) => s.trim()).filter(Boolean).join(" ");
    const res = await profile.update({
      displayName: composed || undefined,
      givenName: form.givenName.trim() || undefined,
      familyName: form.familyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      bio: form.bio.trim() || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      facebookUrl: form.facebookUrl.trim() || undefined,
      twitterUrl: form.twitterUrl.trim() || undefined,
      linkedinUrl: form.linkedinUrl.trim() || undefined,
      instagramUrl: form.instagramUrl.trim() || undefined,
      websiteUrl: form.websiteUrl.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save profile", description: res.error });
      return;
    }
    setData(res.data);
    showToast({ tone: "success", title: "Profile saved" });
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCropSrc(URL.createObjectURL(file));
    e.target.value = ""; // allow re-picking the same file
  };

  const uploadCropped = async (blob: Blob) => {
    setUploading(true);
    const res = await profile.uploadAvatar(blob);
    setUploading(false);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't upload avatar", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Avatar updated" });
    void load();
  };

  const addAvatar = async () => {
    const url = newAvatarUrl.trim();
    if (!url) return;
    const res = await profile.addAvatar(url);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add avatar", description: res.error });
      return;
    }
    setNewAvatarUrl("");
    void load();
  };

  const selectAvatar = async (id: string) => {
    const res = await profile.selectAvatar(id);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't select avatar", description: res.error });
      return;
    }
    void load();
  };

  const deleteAvatar = async (id: string) => {
    const res = await profile.deleteAvatar(id);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete avatar", description: res.error });
      return;
    }
    void load();
  };

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page-stack">
        <EmptyState title="Couldn't load your profile" description={error} ctaLabel="Retry" onCta={() => void load()} />
      </div>
    );
  }

  const fullName = [form.givenName, form.familyName].filter(Boolean).join(" ") || form.displayName;

  return (
    <div className="page-stack">
      <div>
        <h1 className="text-3xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your name, avatar and personal details.</p>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar src={selectedAvatar?.url} name={fullName || email} className="h-16 w-16 text-lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{fullName || email || "You"}</p>
            {email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
            {role || superAdmin ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {role ? (
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {role}
                  </span>
                ) : null}
                {superAdmin ? (
                  <span className="inline-block rounded-full bg-warning-container px-2 py-0.5 text-xs font-medium text-warning-foreground">
                    Super Admin
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Avatars */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {avatars.length === 0 ? (
            <p className="text-sm text-muted-foreground">No avatars yet. Add one by image URL below.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {avatars.map((a) => (
                <div key={a.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void selectAvatar(a.id)}
                    className={`rounded-full ring-2 ring-offset-2 ring-offset-surface transition ${
                      a.isSelected ? "ring-primary" : "ring-transparent hover:ring-border"
                    }`}
                    title={a.isSelected ? "Selected" : "Use this avatar"}
                  >
                    <Avatar src={a.url} className="h-14 w-14" />
                  </button>
                  {a.isSelected ? (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void deleteAvatar(a.id)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-error"
                      title="Delete avatar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload a photo"}
            </Button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Or add by image URL</summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Field label="Image URL" htmlFor="avatar-url" className="flex-1 min-w-[16rem]">
                <Input
                  id="avatar-url"
                  placeholder="https://…"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                />
              </Field>
              <Button variant="outline" onClick={() => void addAvatar()} disabled={!newAvatarUrl.trim()}>
                Add
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>

      {cropSrc ? (
        <AvatarCropper
          imageSrc={cropSrc}
          busy={uploading}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onCropped={(blob) => void uploadCropped(blob)}
        />
      ) : null}

      {/* Personal information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="displayName">
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field label="First name" htmlFor="givenName">
              <Input
                id="givenName"
                value={form.givenName}
                onChange={(e) => setForm((f) => ({ ...f, givenName: e.target.value }))}
              />
            </Field>
            <Field label="Last name" htmlFor="familyName">
              <Input
                id="familyName"
                value={form.familyName}
                onChange={(e) => setForm((f) => ({ ...f, familyName: e.target.value }))}
              />
            </Field>
            <Field label="Date of birth" htmlFor="dateOfBirth">
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Bio" htmlFor="bio">
            <Textarea
              id="bio"
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </Field>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Social links</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["facebookUrl", "Facebook"],
                  ["twitterUrl", "X (Twitter)"],
                  ["linkedinUrl", "LinkedIn"],
                  ["instagramUrl", "Instagram"],
                  ["websiteUrl", "Website"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} htmlFor={key}>
                  <Input
                    id={key}
                    type="url"
                    placeholder="https://…"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
