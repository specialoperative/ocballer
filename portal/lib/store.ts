import { put, list, del } from "@vercel/blob";

/**
 * Everything lives in Blob: one JSON index plus the photo files themselves.
 * One store, one env var, nothing to provision beyond it.
 *
 * The index is read-modify-write, which is safe here because the portal has a
 * single operator. If two people ever edit at once, the later write wins —
 * move the index to Postgres before that becomes true.
 */
const INDEX_PATH = "data/index.json";

export interface CopyItem {
  id: string;
  text: string;
  label: string;
  createdAt: string;
}

export interface PhotoItem {
  id: string;
  url: string;
  label: string;
  createdAt: string;
}

export interface QueuedPost {
  id: string;
  copyId: string;
  photoId: string | null;
  text: string;
  photoUrl: string | null;
  target: string;
  status: "queued" | "approved" | "posted";
  createdAt: string;
}

export interface StoreData {
  copy: CopyItem[];
  photos: PhotoItem[];
  posts: QueuedPost[];
}

const EMPTY: StoreData = { copy: [], photos: [], posts: [] };

export function isConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readStore(): Promise<StoreData> {
  if (!isConfigured()) return EMPTY;

  const found = await list({ prefix: INDEX_PATH, limit: 1 });
  const blob = found.blobs[0];
  if (!blob) return EMPTY;

  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return EMPTY;

  const parsed = (await response.json()) as Partial<StoreData>;
  return { copy: parsed.copy ?? [], photos: parsed.photos ?? [], posts: parsed.posts ?? [] };
}

export async function writeStore(data: StoreData): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  const options = {
    access: "public" as const,
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  };

  try {
    await put(INDEX_PATH, body, options);
  } catch (error) {
    // Older blob versions overwrite silently; newer ones refuse without an
    // explicit flag. Clearing first works on both.
    if (!/exist|overwrite/i.test((error as Error).message)) throw error;
    await del(INDEX_PATH).catch(() => undefined);
    await put(INDEX_PATH, body, options);
  }
}

export async function mutate(fn: (data: StoreData) => StoreData): Promise<StoreData> {
  const next = fn(await readStore());
  await writeStore(next);
  return next;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
