const DB_NAME = "expense_tracker_offline";
const DB_VERSION = 1;

export interface OfflineCacheEntry {
  key: string;
  data: any;
  timestamp: number;
}

export interface PendingTransaction {
  id: string; // Temporary UUID or timestamp
  payload: any;
  createdAt: number;
}

export function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("pending_transactions")) {
        db.createObjectStore("pending_transactions", { keyPath: "id" });
      }
    };
  });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("cache", "readonly");
      const store = transaction.objectStore("cache");
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as OfflineCacheEntry | undefined;
        resolve(result ? result.data : null);
      };
    });
  } catch (error) {
    console.error("IndexedDB getCachedData error:", error);
    return null;
  }
}

export async function setCachedData(key: string, data: any): Promise<void> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("cache", "readwrite");
      const store = transaction.objectStore("cache");
      const entry: OfflineCacheEntry = {
        key,
        data,
        timestamp: Date.now(),
      };
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("IndexedDB setCachedData error:", error);
  }
}

export async function queuePendingTransaction(payload: any): Promise<string> {
  const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pending_transactions", "readwrite");
      const store = transaction.objectStore("pending_transactions");
      const item: PendingTransaction = {
        id,
        payload,
        createdAt: Date.now(),
      };
      const request = store.put(item);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  } catch (error) {
    console.error("IndexedDB queuePendingTransaction error:", error);
    return id;
  }
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pending_transactions", "readonly");
      const store = transaction.objectStore("pending_transactions");
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (error) {
    console.error("IndexedDB getPendingTransactions error:", error);
    return [];
  }
}

export async function deletePendingTransaction(id: string): Promise<void> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pending_transactions", "readwrite");
      const store = transaction.objectStore("pending_transactions");
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("IndexedDB deletePendingTransaction error:", error);
  }
}
