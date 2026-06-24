import { request } from "@/lib/api";

export type StoredFile = {
  id: string;
  tenantId: string;
  name: string;
  pathname: string;
  url: string;
  contentType: string | null;
  sizeBytes: number;
  folder: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listFiles(folder?: string) {
  const qs = folder ? `?folder=${encodeURIComponent(folder)}` : "";
  return request<StoredFile[]>(`/files${qs}`);
}

export async function uploadFile(file: File, folder?: string) {
  const form = new FormData();
  form.append("file", file);
  if (folder) form.append("folder", folder);
  // request() leaves Content-Type unset for FormData (multipart boundary is added by fetch).
  return request<StoredFile>("/files", { method: "POST", body: form });
}

export async function deleteFile(id: string) {
  return request<{ id: string }>(`/files/${encodeURIComponent(id)}`, { method: "DELETE" });
}
