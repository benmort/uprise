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

export type FileCategoryKey = "image" | "video" | "audio" | "document" | "other";

export type FilesSummary = {
  totalCount: number;
  totalBytes: number;
  categories: Array<{ key: FileCategoryKey; count: number; bytes: number }>;
  folders: Array<{ folder: string; count: number; bytes: number }>;
};

export async function getFilesSummary() {
  return request<FilesSummary>("/files/summary");
}

export async function listFiles(opts: { folder?: string; take?: number; skip?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.folder) params.set("folder", opts.folder);
  if (opts.take !== undefined) params.set("take", String(opts.take));
  if (opts.skip !== undefined) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return request<{ rows: StoredFile[]; total: number }>(`/files${qs ? `?${qs}` : ""}`);
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
