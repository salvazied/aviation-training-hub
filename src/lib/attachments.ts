import type { TrainingAttachment } from "./data";

const DB_NAME = "tt_training_attachments_v1";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open attachment storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Attachment storage failed."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Attachment transaction failed."));
    };
  });
}

export async function saveAttachmentFile(file: File): Promise<TrainingAttachment> {
  const meta: TrainingAttachment = {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.put({ ...meta, blob: file }));
  return meta;
}

export async function getAttachmentBlob(attachment: TrainingAttachment): Promise<Blob | null> {
  const record = await withStore<any | undefined>("readonly", (store) => store.get(attachment.id));
  return record?.blob ?? null;
}

export async function deleteAttachmentFile(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function downloadAttachmentFile(attachment: TrainingAttachment): Promise<void> {
  const blob = await getAttachmentBlob(attachment);
  if (!blob) throw new Error("Attachment file was not found in this browser.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = attachment.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function openAttachmentFile(attachment: TrainingAttachment): Promise<void> {
  const blob = await getAttachmentBlob(attachment);
  if (!blob) throw new Error("Attachment file was not found in this browser.");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}