"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Spinner,
  Textarea,
} from "@uprise/ui";
import { profile, type UserAvatarResponse, type UserProfileResponse } from "@uprise/api-client";
import { useToast } from "@/components/ui/toast";
import { getSession } from "@/lib/session";
import { emitProfileUpdated } from "@/lib/profile-events";
import { Modal } from "@/components/ui/modal";
import UserProfileCard from "@/components/user-profile/UserProfileCard";
import AvatarEditCard from "@/components/user-profile/AvatarEditCard";
import { OriginBackLink } from "@/components/setup/origin-deep-link";

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

/** Self-service profile (prog parity): identity card + avatar edit modal + personal info. */
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
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);

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

  const selectedUrl = avatars.find((a) => a.isSelected)?.url ?? data?.avatarUrl ?? null;

  const save = async () => {
    setSaving(true);
    // Keep a real name on the topbar: fall back to given+family when display name is blank.
    const composed =
      form.displayName.trim() ||
      [form.givenName, form.familyName].map((s) => s.trim()).filter(Boolean).join(" ");
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
    emitProfileUpdated(); // refresh the topbar name/avatar
    showToast({ tone: "success", title: "Profile saved" });
  };

  if (loading) {
    return (
      <div className="page-stack">
      <OriginBackLink />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Couldn't load your profile"
          description={error}
          ctaLabel="Retry"
          onCta={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div>
        <h1 className="text-3xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your name, avatar and personal details.</p>
      </div>

      <UserProfileCard
        profile={data}
        avatarUrl={selectedUrl}
        email={email}
        role={role}
        superAdmin={superAdmin}
        onEditAvatar={() => setShowAvatarEdit(true)}
      />

      <Modal isOpen={showAvatarEdit} onClose={() => setShowAvatarEdit(false)} className="m-4 max-w-[700px]">
        <div className="no-scrollbar max-h-[85vh] overflow-y-auto p-4 lg:p-8">
          <AvatarEditCard
            inModal
            onClose={() => setShowAvatarEdit(false)}
            onSave={() => {
              setShowAvatarEdit(false);
              void load();
              emitProfileUpdated(); // refresh the topbar avatar
            }}
          />
        </div>
      </Modal>

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
              {saving ? (<><Spinner className="mr-2" />Saving…</>) : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
