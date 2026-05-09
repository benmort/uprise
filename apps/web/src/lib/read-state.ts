const DB_NAME = "yarn_read_state";
const STORE_NAME = "read_state";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: "phone" });
      }
    };
  });
}

export async function getAllLastReadAt(): Promise<Record<string, string>> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return {};
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      const out: Record<string, string> = {};
      for (const row of req.result || []) {
        if (row?.phone && row?.lastReadAt) out[String(row.phone)] = String(row.lastReadAt);
      }
      resolve(out);
    };
  });
}

export async function setLastReadAt(phone: string, lastReadAt: string): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ phone, lastReadAt });
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}
