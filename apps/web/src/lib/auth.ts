export type Credentials = {
  username: string;
  password: string;
};

const KEY = "yarn_auth_credentials";
const LEGACY_LOCAL_STORAGE_KEY = "yarn_auth_credentials";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function migrateLegacyCredentials(): Credentials | null {
  if (typeof window === "undefined") return null;
  const legacyRaw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
  if (!legacyRaw) return null;
  try {
    const parsed = JSON.parse(legacyRaw) as Credentials;
    if (!parsed.username || !parsed.password) return null;
    const session = getSessionStorage();
    session?.setItem(KEY, JSON.stringify(parsed));
    window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function setCredentials(credentials: Credentials): void {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify(credentials));
  window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
}

export function getCredentials(): Credentials | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const raw = storage.getItem(KEY);
  if (!raw) return migrateLegacyCredentials();
  try {
    const parsed = JSON.parse(raw) as Credentials;
    if (!parsed.username || !parsed.password) return null;
    return parsed;
  } catch {
    return migrateLegacyCredentials();
  }
}

export function clearCredentials(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(KEY);
  window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  window.localStorage.removeItem("yarns.canvasserId");
}

export function getBasicAuthHeader(credentials: Credentials): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}
