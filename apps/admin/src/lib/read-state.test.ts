import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllLastReadAt, setLastReadAt } from "./read-state";

/**
 * read-state is the local "you have already read this far" marker for the SMS inbox: the unread
 * badge on a conversation is `lastMessageAt > lastReadAt`. It lives in IndexedDB rather than the
 * API, so the only way to exercise it is against an IndexedDB.
 *
 * jsdom implements none, and `fake-indexeddb` is a devDependency of `packages/field` alone – not
 * resolvable from apps/admin, and package.json is out of bounds for this change. So the fake below
 * honours the slice of the IDB contract this module leans on, and nothing more:
 *
 *  - databases are keyed BY NAME, so a write and a read only meet if both functions name the same
 *    database (they do – `yarn_read_state`);
 *  - `onupgradeneeded` fires only when the requested version exceeds the stored one, and
 *    `createObjectStore` throws `ConstraintError` on a duplicate name, exactly as a browser does –
 *    which is the whole reason openDb() guards on `objectStoreNames.contains`;
 *  - `put` upserts on the key path the source declared, so a wrong key path shows up as duplicate
 *    rows rather than passing silently;
 *  - request callbacks fire asynchronously – the source assigns `onsuccess`/`onerror` *after* the
 *    call returns, so a synchronous fake would pass tests the browser would fail.
 */

type StoredRow = Record<string, unknown>;
type StoreState = { keyPath: string; rows: StoredRow[] };
type DatabaseState = { version: number; stores: Map<string, StoreState> };

class FakeRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

function createFakeIdb(existing?: { version: number; rows: StoredRow[] }) {
  const databases = new Map<string, DatabaseState>();
  if (existing) {
    databases.set("yarn_read_state", {
      version: existing.version,
      stores: new Map([["read_state", { keyPath: "phone", rows: [...existing.rows] }]]),
    });
  }

  let openConnections = 0;
  let upgrades = 0;
  let nextRequestError: DOMException | null = null;
  let openError: DOMException | null = null;

  const takeRequestError = () => {
    const err = nextRequestError;
    nextRequestError = null;
    return err;
  };

  class FakeObjectStore {
    private readonly store: StoreState;
    constructor(store: StoreState) {
      this.store = store;
    }

    getAll(): FakeRequest {
      const req = new FakeRequest();
      queueMicrotask(() => {
        const err = takeRequestError();
        if (err) {
          req.error = err;
          req.onerror?.();
          return;
        }
        req.result = this.store.rows.map((row) => ({ ...row }));
        req.onsuccess?.();
      });
      return req;
    }

    put(value: StoredRow): FakeRequest {
      const req = new FakeRequest();
      queueMicrotask(() => {
        const err = takeRequestError();
        if (err) {
          req.error = err;
          req.onerror?.();
          return;
        }
        const key = value[this.store.keyPath];
        const at = this.store.rows.findIndex((row) => row[this.store.keyPath] === key);
        if (at === -1) this.store.rows.push({ ...value });
        else this.store.rows[at] = { ...value };
        req.result = key;
        req.onsuccess?.();
      });
      return req;
    }
  }

  class FakeDb {
    closed = false;
    objectStoreNames: { contains: (name: string) => boolean };
    private readonly db: DatabaseState;

    constructor(db: DatabaseState) {
      this.db = db;
      this.objectStoreNames = { contains: (name) => this.db.stores.has(name) };
    }

    createObjectStore(name: string, options: { keyPath: string }) {
      if (this.db.stores.has(name)) {
        throw new DOMException(`object store ${name} already exists`, "ConstraintError");
      }
      const store: StoreState = { keyPath: options.keyPath, rows: [] };
      this.db.stores.set(name, store);
      return new FakeObjectStore(store);
    }

    transaction(name: string, _mode: "readonly" | "readwrite") {
      if (this.closed) throw new DOMException("database is closed", "InvalidStateError");
      const store = this.db.stores.get(name);
      if (!store) throw new DOMException(`no object store named ${name}`, "NotFoundError");
      return { objectStore: () => new FakeObjectStore(store) };
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      openConnections -= 1;
    }
  }

  return {
    indexedDB: {
      open(name: string, requestedVersion: number): FakeRequest {
        const req = new FakeRequest();
        queueMicrotask(() => {
          if (openError) {
            req.error = openError;
            openError = null;
            req.onerror?.();
            return;
          }
          const db = databases.get(name) ?? { version: 0, stores: new Map() };
          databases.set(name, db);
          const handle = new FakeDb(db);
          openConnections += 1;
          req.result = handle;
          if (requestedVersion > db.version) {
            db.version = requestedVersion;
            upgrades += 1;
            req.onupgradeneeded?.();
          }
          req.onsuccess?.();
        });
        return req;
      },
    },
    /** Connections opened and never closed – a leaked one pins the schema version open. */
    get openConnections() {
      return openConnections;
    },
    get upgrades() {
      return upgrades;
    },
    rows: (dbName = "yarn_read_state") => databases.get(dbName)?.stores.get("read_state")?.rows ?? [],
    databaseNames: () => [...databases.keys()],
    failNextRequest: (err: DOMException) => {
      nextRequestError = err;
    },
    failNextOpen: (err: DOMException) => {
      openError = err;
    },
  };
}

type FakeIdb = ReturnType<typeof createFakeIdb>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("read-state without IndexedDB", () => {
  // jsdom ships no IndexedDB, so this is the unstubbed state – the same shape a server render or
  // a browser with storage disabled sees.
  it("confirms the environment really has no IndexedDB", () => {
    expect("indexedDB" in window).toBe(false);
  });

  /**
   * The inbox derives every unread badge from this map. A browser with IndexedDB switched off
   * (or blocked by a privacy setting) must degrade to "nothing is marked read" – a throw here
   * takes the whole conversation list down rather than losing a cosmetic badge.
   */
  it("reads back an empty map instead of throwing", async () => {
    await expect(getAllLastReadAt()).resolves.toEqual({});
  });

  // Opening a conversation calls this on every render pass; a rejection would surface as an
  // unhandled promise rejection on a page that is otherwise working fine.
  it("swallows the write instead of throwing", async () => {
    await expect(setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z")).resolves.toBeUndefined();
  });
});

describe("read-state with IndexedDB", () => {
  let idb: FakeIdb;

  const install = (fake: FakeIdb) => {
    idb = fake;
    vi.stubGlobal("indexedDB", fake.indexedDB);
  };

  beforeEach(() => {
    install(createFakeIdb());
  });

  it("round-trips a marker – a write is visible to the next read", async () => {
    await setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z");
    await setLastReadAt("+61400000002", "2026-08-08T02:30:00.000Z");

    // Both functions have to name the same database for this to hold; the fake keys by name.
    await expect(getAllLastReadAt()).resolves.toEqual({
      "+61400000001": "2026-08-08T01:00:00.000Z",
      "+61400000002": "2026-08-08T02:30:00.000Z",
    });
  });

  /**
   * The store is keyed on `phone`, so re-reading a conversation must REPLACE its marker. If the
   * key path were wrong the puts would append instead, and `getAll` would then hand whichever
   * duplicate it enumerated last – an older timestamp winning would make an already-read thread
   * pop back to unread on the next page load.
   */
  it("moves an existing marker forward rather than stacking a second row", async () => {
    await setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z");
    await setLastReadAt("+61400000001", "2026-08-08T03:45:00.000Z");

    expect(idb.rows()).toHaveLength(1);
    await expect(getAllLastReadAt()).resolves.toEqual({
      "+61400000001": "2026-08-08T03:45:00.000Z",
    });
  });

  // First-ever visit: the store exists but holds nothing. Everything unread is the right answer.
  it("returns an empty map for a store that has never been written", async () => {
    await expect(getAllLastReadAt()).resolves.toEqual({});
  });

  /**
   * A returning organiser already has the database at the current version, so no upgrade event
   * fires and `createObjectStore` is never reached. Re-creating a store that already exists is a
   * ConstraintError in a real browser, which is what the `objectStoreNames.contains` guard averts.
   */
  it("reads a database an earlier session already created, without a second upgrade", async () => {
    install(
      createFakeIdb({
        version: 1,
        rows: [{ phone: "+61400000009", lastReadAt: "2026-07-01T00:00:00.000Z" }],
      }),
    );

    await expect(getAllLastReadAt()).resolves.toEqual({
      "+61400000009": "2026-07-01T00:00:00.000Z",
    });
    expect(idb.upgrades).toBe(0);
  });

  it("creates the store on the very first open, once", async () => {
    await setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z");
    await getAllLastReadAt();
    await setLastReadAt("+61400000002", "2026-08-08T02:00:00.000Z");

    expect(idb.upgrades).toBe(1);
  });

  /**
   * Rows written by an older shape of this store (or a half-finished write) must be dropped, not
   * projected. Keying the map on a missing phone would produce an `"undefined"` entry, and the
   * inbox looks up by phone number – a bogus key is harmless, but a row with a phone and no
   * timestamp would yield `undefined` as the marker and make every message in that thread compare
   * as read.
   */
  it("skips rows missing a phone or a timestamp", async () => {
    install(
      createFakeIdb({
        version: 1,
        rows: [
          { phone: "+61400000001", lastReadAt: "2026-08-08T01:00:00.000Z" },
          { phone: "+61400000002" },
          { lastReadAt: "2026-08-08T02:00:00.000Z" },
          {},
        ],
      }),
    );

    await expect(getAllLastReadAt()).resolves.toEqual({
      "+61400000001": "2026-08-08T01:00:00.000Z",
    });
  });

  // Every operation hands the connection back. A leaked one keeps the old schema version pinned,
  // so a future DB_VERSION bump would sit in `blocked` forever instead of upgrading.
  it("closes the connection after a read and after a write", async () => {
    await getAllLastReadAt();
    expect(idb.openConnections).toBe(0);

    await setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z");
    expect(idb.openConnections).toBe(0);
  });

  /**
   * A failed write must reject. Resolving would tell the inbox the conversation is marked read
   * while nothing was persisted, and the badge would come back on the next load with no clue why.
   */
  it("rejects a write the browser refused, and still releases the connection", async () => {
    idb.failNextRequest(new DOMException("quota exceeded", "QuotaExceededError"));

    await expect(setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z")).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
    expect(idb.openConnections).toBe(0);
    expect(idb.rows()).toHaveLength(0);
  });

  it("rejects a read the browser refused, and still releases the connection", async () => {
    idb.failNextRequest(new DOMException("store is corrupt", "UnknownError"));

    await expect(getAllLastReadAt()).rejects.toMatchObject({ name: "UnknownError" });
    expect(idb.openConnections).toBe(0);
  });

  /**
   * Safari's private mode and a corrupt profile both fail at `open` rather than at the request.
   * The failure has to surface as a rejection – a promise that never settles would leave an
   * `await` in the inbox hanging and the read markers permanently mid-load.
   */
  it("rejects when the database itself will not open", async () => {
    idb.failNextOpen(new DOMException("access denied", "InvalidStateError"));
    await expect(getAllLastReadAt()).rejects.toMatchObject({ name: "InvalidStateError" });

    idb.failNextOpen(new DOMException("access denied", "InvalidStateError"));
    await expect(setLastReadAt("+61400000001", "2026-08-08T01:00:00.000Z")).rejects.toMatchObject({
      name: "InvalidStateError",
    });
  });
});
