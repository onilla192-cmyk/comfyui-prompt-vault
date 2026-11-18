import {
  BLOB_STORE,
  DATASET_KEY,
  DB_NAME,
  FOLDER_STORE,
  PRESET_STORE,
  type Dataset,
  type Folder,
  type Preset,
  type Thumbnail,
  type VaultItem,
} from "./types";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      if (!db.objectStoreNames.contains(PRESET_STORE)) db.createObjectStore(PRESET_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage."));
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was cancelled."));
  });
}

export function readDatasets(): Dataset[] {
  try {
    const value = JSON.parse(localStorage.getItem(DATASET_KEY) || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((page): page is Dataset => {
      if (!page || typeof page !== "object") return false;
      const record = page as Dataset;
      return typeof record.id === "string" && Array.isArray(record.items);
    });
  } catch {
    return [];
  }
}

export function writeDatasets(datasets: Dataset[]) {
  localStorage.setItem(DATASET_KEY, JSON.stringify(datasets));
}

export async function putBlob(key: string, blob: Blob) {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readwrite");
  tx.objectStore(BLOB_STORE).put(blob, key);
  await txDone(tx);
  db.close();
}

export async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = db.transaction(BLOB_STORE).objectStore(BLOB_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

export async function deleteBlobs(keys: string[]) {
  if (!keys.length) return;
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readwrite");
  const store = tx.objectStore(BLOB_STORE);
  for (const key of keys) store.delete(key);
  await txDone(tx);
  db.close();
}

export async function clearBlobs() {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readwrite");
  tx.objectStore(BLOB_STORE).clear();
  await txDone(tx);
  db.close();
}

async function readStore<T>(name: string): Promise<T[]> {
  const db = await openDb();
  const rows = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? (request.result as T[]) : []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows;
}

export function loadPresets() {
  return readStore<Preset>(PRESET_STORE);
}


export function loadFolders() {
  return readStore<Folder>(FOLDER_STORE);
}

const LEGACY_PRESET_DB = "prompt-vault-created-presets-v1";
const LEGACY_MEDIA_DB = "prompt-vault-imported-media";
const LEGACY_MIGRATION_KEY = "prompt-vault-legacy-browser-data-v1";

async function readLegacyStore<T>(databaseName: string, storeName: string): Promise<T[]> {
  let createdDuringRead = false;
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onupgradeneeded = () => {
      createdDuringRead = true;
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read legacy browser data."));
  });
  if (!db) return [];
  if (!db.objectStoreNames.contains(storeName)) {
    db.close();
    if (createdDuringRead) {
      const deletion = indexedDB.deleteDatabase(databaseName);
      deletion.onerror = () => console.warn("Could not remove an empty temporary database:", databaseName);
    }
    return [];
  }
  const rows = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? (request.result as T[]) : []);
    request.onerror = () => reject(request.error ?? new Error("Could not read legacy records."));
  });
  db.close();
  return rows;
}

async function readLegacyBlobs(): Promise<Array<{ key: IDBValidKey; blob: Blob }>> {
  let createdDuringRead = false;
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_MEDIA_DB);
    request.onupgradeneeded = () => { createdDuringRead = true; };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read legacy image storage."));
  });
  if (!db) return [];
  if (!db.objectStoreNames.contains("images")) {
    db.close();
    if (createdDuringRead) indexedDB.deleteDatabase(LEGACY_MEDIA_DB);
    return [];
  }
  const entries = await new Promise<Array<{ key: IDBValidKey; blob: Blob }>>((resolve, reject) => {
    const request = db.transaction("images", "readonly").objectStore("images").getAll();
    const keysRequest = db.transaction("images", "readonly").objectStore("images").getAllKeys();
    let values: Blob[] | null = null;
    let keys: IDBValidKey[] | null = null;
    const finish = () => {
      if (values && keys) resolve(keys.flatMap((key, index) => values?.[index] instanceof Blob ? [{ key, blob: values[index] }] : []));
    };
    request.onsuccess = () => { values = request.result as Blob[]; finish(); };
    keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
    request.onerror = () => reject(request.error ?? new Error("Could not read legacy image records."));
    keysRequest.onerror = () => reject(keysRequest.error ?? new Error("Could not read legacy image keys."));
  });
  db.close();
  return entries;
}

/** Copy records from the previous static vault databases without deleting or modifying them. */
export async function migrateLegacyBrowserData() {
  if (localStorage.getItem(LEGACY_MIGRATION_KEY) === "complete") return;
  const [legacyPresets, legacyFolders, legacyBlobs] = await Promise.all([
    readLegacyStore<Partial<Preset>>(LEGACY_PRESET_DB, PRESET_STORE),
    readLegacyStore<Partial<Folder>>(LEGACY_PRESET_DB, FOLDER_STORE),
    readLegacyBlobs(),
  ]);
  const [currentPresets, currentFolders] = await Promise.all([loadPresets(), loadFolders()]);
  const presetIds = new Set(currentPresets.map((entry) => entry.id));
  const folderIds = new Set(currentFolders.map((entry) => entry.id));
  for (const record of legacyPresets) {
    if (typeof record.id !== "string" || presetIds.has(record.id) || typeof record.title !== "string") continue;
    await savePreset({
      ...record,
      id: record.id,
      title: record.title,
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    } as Preset);
    presetIds.add(record.id);
  }
  for (const record of legacyFolders) {
    if (typeof record.id !== "string" || folderIds.has(record.id) || typeof record.name !== "string") continue;
    await saveFolder({
      ...record,
      id: record.id,
      name: record.name,
      createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    } as Folder);
    folderIds.add(record.id);
  }
  for (const entry of legacyBlobs) {
    if (typeof entry.key === "string") await putBlob(entry.key, entry.blob);
  }
  localStorage.setItem(LEGACY_MIGRATION_KEY, "complete");
}

export async function savePreset(preset: Preset) {
  const db = await openDb();
  const tx = db.transaction(PRESET_STORE, "readwrite");
  tx.objectStore(PRESET_STORE).put(preset);
  await txDone(tx);
  db.close();
}

export async function saveFolder(folder: Folder) {
  const db = await openDb();
  const tx = db.transaction(FOLDER_STORE, "readwrite");
  tx.objectStore(FOLDER_STORE).put(folder);
  await txDone(tx);
  db.close();
}

export async function removeFolderRecord(id: string) {
  const db = await openDb();
  const tx = db.transaction(FOLDER_STORE, "readwrite");
  tx.objectStore(FOLDER_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function removePreset(id: string) {
  const db = await openDb();
  const tx = db.transaction(PRESET_STORE, "readwrite");
  tx.objectStore(PRESET_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function removePresets(ids: string[]) {
  const db = await openDb();
  const tx = db.transaction(PRESET_STORE, "readwrite");
  const store = tx.objectStore(PRESET_STORE);
  for (const id of ids) store.delete(id);
  await txDone(tx);
  db.close();
}

export function decodeDataUrl(value: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new Error("Invalid embedded image data.");
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: match[1] || "application/octet-stream" });
}

export function validateDatasetFile(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The file must contain a JSON object.");
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("This file does not contain a valid items array.");
  return items.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Record ${index + 1} is invalid.`);
    }
    const record = entry as { prompt?: unknown; images?: unknown };
    const images = Array.isArray(record.images)
      ? record.images
          .filter((image): image is { data: string; filename?: string; mimeType?: string } => {
            if (!image || typeof image !== "object") return false;
            const data = (image as { data?: unknown }).data;
            return typeof data === "string" && data.startsWith("data:");
          })
          .map((image) => ({
            filename: image.filename || "image",
            mimeType: image.mimeType || "image/png",
            data: image.data,
          }))
      : [];
    return { prompt: record.prompt == null ? "" : String(record.prompt), images };
  });
}

export async function importDatasetRecords(options: {
  fileName: string;
  records: ReturnType<typeof validateDatasetFile>;
  useImages: boolean;
  usePrompts: boolean;
  skipDuplicates: boolean;
  existing: Dataset[];
}) {
  const known = new Set(
    options.existing.flatMap((page) => page.items.map((item) => item.prompt).filter(Boolean)),
  );
  const items: VaultItem[] = [];
  let images = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const source of options.records) {
    if (options.skipDuplicates && source.prompt && known.has(source.prompt)) {
      duplicates += 1;
      continue;
    }
    const refs: VaultItem["images"] = [];
    if (options.useImages) {
      for (const image of source.images) {
        try {
          const blob = decodeDataUrl(image.data);
          const cacheKey = uid("media");
          await putBlob(cacheKey, blob);
          refs.push({
            id: uid("ref"),
            cacheKey,
            filename: image.filename,
            mimeType: image.mimeType || blob.type,
          });
          images += 1;
        } catch {
          invalid += 1;
        }
      }
    }
    const prompt = options.usePrompts ? source.prompt : "";
    if (!prompt && !refs.length) continue;
    items.push({
      id: uid("item"),
      name: prompt.trim().split(/\s+/).slice(0, 4).join(" ") || "Imported item",
      prompt,
      images: refs,
    });
    if (source.prompt) known.add(source.prompt);
  }
  const page: Dataset = {
    id: uid("dataset"),
    name: options.fileName.replace(/\.json$/i, "") || "Imported",
    importedAt: new Date().toISOString(),
    items,
  };
  writeDatasets([...options.existing, page]);
  return { page, images, duplicates, invalid };
}

export async function createCard(prompt: string, file: File | null) {
  const images: VaultItem["images"] = [];
  if (file) {
    const cacheKey = uid("media");
    await putBlob(cacheKey, file);
    images.push({ id: uid("ref"), cacheKey, filename: file.name || "image", mimeType: file.type || "image/png" });
  }
  const item: VaultItem = {
    id: uid("item"),
    name: prompt.trim().split(/\s+/).slice(0, 4).join(" ") || "Untitled card",
    prompt,
    images,
  };
  const datasets = readDatasets();
  let handmade = datasets.find((page) => page.id === "handmade");
  if (!handmade) {
    handmade = { id: "handmade", name: "Handmade cards", importedAt: new Date().toISOString(), items: [] };
    datasets.push(handmade);
  }
  handmade.items.push(item);
  writeDatasets(datasets);
  return item;
}

const STARTERS: Array<{ name: string; prompt: string }> = [
  {
    name: "Amber window portrait",
    prompt:
      "medium shot portrait, person seated beside a rain-streaked window, warm tungsten practical light, shallow depth of field, 35mm film grain, muted ochre and ink palette, quiet expression",
  },
  {
    name: "Workshop still life",
    prompt:
      "tabletop still life of brass calipers, a torn sketch, and a ceramic cup, overhead softbox, fine dust in the light, realistic product photography, square crop",
  },
  {
    name: "Night market neon",
    prompt:
      "wide cinematic street at night after rain, paper lanterns and a single amber neon sign, reflections on wet asphalt, anamorphic bokeh, no readable text",
  },
  {
    name: "Botanical study",
    prompt:
      "botanical study of a dried fern on cream paper, graphite and watercolor wash, museum archive lighting, high detail veins, generous negative space",
  },
];

export function ensureSeed() {
  if (localStorage.getItem(DATASET_KEY)) return;
  const dataset: Dataset = {
    id: "starters",
    name: "Studio starters",
    importedAt: new Date().toISOString(),
    items: STARTERS.map((entry) => ({
      id: uid("item"),
      name: entry.name,
      prompt: entry.prompt,
      images: [],
    })),
  };
  writeDatasets([dataset]);
}

export function isImageOrMp4(file: File) {
  return file.type.startsWith("image/") || file.type === "video/mp4";
}

export async function fileToThumbnail(file: File): Promise<Thumbnail> {
  if (!isImageOrMp4(file)) throw new Error("Choose an image or an MP4 video.");
  if (file.size > 16 * 1024 * 1024) throw new Error("Choose a file smaller than 16 MB.");
  if (file.type === "video/mp4") {
    const dataUrl = await blobToDataUrl(file);
    const poster = await videoPoster(file);
    return {
      dataUrl,
      posterDataUrl: poster.dataUrl,
      width: poster.width,
      height: poster.height,
      type: file.type,
      size: file.size,
    };
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This image could not be opened.");
  });
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error("Choose an image up to 24 megapixels.");
    const canvas = document.createElement("canvas");
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the thumbnail.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Could not compress the image."))), "image/webp", 0.82);
    });
    return {
      dataUrl: await blobToDataUrl(blob),
      width: canvas.width,
      height: canvas.height,
      type: blob.type,
      size: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the file.")));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

function videoPoster(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  return new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
    video.addEventListener(
      "loadeddata",
      () => {
        if (!video.videoWidth) {
          URL.revokeObjectURL(url);
          reject(new Error("This video has no readable first frame."));
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Could not create the video thumbnail."));
          return;
        }
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, width: canvas.width, height: canvas.height });
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read this video."));
      },
      { once: true },
    );
  });
}

export function newId(prefix: string) {
  return uid(prefix);
}

export function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function cleanPreset(value: unknown, index: number): Preset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Preset>;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  if (typeof record.prompt !== "string" || !record.prompt.trim()) return null;
  const thumbnail =
    record.thumbnail &&
    typeof record.thumbnail.dataUrl === "string" &&
    (record.thumbnail.dataUrl.startsWith("data:image/") || record.thumbnail.dataUrl.startsWith("data:video/mp4"))
      ? record.thumbnail
      : undefined;
  const tags = Array.isArray(record.tags)
    ? record.tags.flatMap((tag) => {
        if (!tag || typeof tag !== "object") return [];
        const entry = tag as { id?: unknown; name?: unknown; info?: unknown };
        if (typeof entry.name !== "string" || typeof entry.info !== "string") return [];
        return [{ id: typeof entry.id === "string" ? entry.id : uid("tag"), name: entry.name, info: entry.info }];
      })
    : undefined;
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : uid(`preset-imported-${index}`),
    title: record.title.trim(),
    prompt: record.prompt.trim(),
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    ...(record.folderId ? { folderId: record.folderId } : {}),
    ...(record.starred ? { starred: true } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}
