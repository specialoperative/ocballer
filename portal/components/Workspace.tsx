"use client";

import { useRef, useState } from "react";
import type { CopyItem, PhotoItem, QueuedPost } from "@/lib/store";

/**
 * Two columns: copy on the left, photos on the right. Pick one of each, name
 * the group, queue it. The queue below is what the Poster publishes once it
 * is approved.
 */
export default function Workspace({
  initialCopy,
  initialPhotos,
  initialPosts,
  configured,
}: {
  initialCopy: CopyItem[];
  initialPhotos: PhotoItem[];
  initialPosts: QueuedPost[];
  configured: boolean;
}) {
  const [copy, setCopy] = useState(initialCopy);
  const [photos, setPhotos] = useState(initialPhotos);
  const [posts, setPosts] = useState(initialPosts);

  const [draft, setDraft] = useState("");
  const [pickedCopy, setPickedCopy] = useState<string | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const guard = () => {
    if (!configured) {
      setError("Create the Blob store first — nothing can save yet.");
      return false;
    }
    return true;
  };

  async function addCopy(text: string, label?: string) {
    if (!text.trim() || !guard()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, label }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save that copy.");
      setCopy(data.copy);
      setDraft("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList) {
    if (!guard()) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const resized = await downscale(file);
        const form = new FormData();
        form.append("file", resized, file.name.replace(/\.\w+$/, ".jpg"));
        form.append("label", file.name);
        const response = await fetch("/api/photos", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Upload failed.");
        setPhotos(data.photos);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function queuePost() {
    if (!pickedCopy || !guard()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ copyId: pickedCopy, photoId: pickedPhoto, target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not queue that.");
      setPosts(data.posts);
      setPickedCopy(null);
      setPickedPhoto(null);
      setTarget("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: QueuedPost["status"]) {
    const response = await fetch("/api/posts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (response.ok) setPosts((await response.json()).posts);
  }

  async function remove(kind: "copy" | "photos" | "posts", id: string) {
    const response = await fetch(`/api/${kind}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return;
    const data = await response.json();
    if (kind === "copy") setCopy(data.copy);
    if (kind === "photos") setPhotos(data.photos);
    if (kind === "posts") setPosts(data.posts);
  }

  const selectedCopy = copy.find((item) => item.id === pickedCopy);
  const selectedPhoto = photos.find((item) => item.id === pickedPhoto);

  return (
    <>
      {error ? <p className="err">{error}</p> : null}

      <div className="columns">
        {/* ---- copy ---- */}
        <section className="col">
          <h2>
            Copy <span>{copy.length}</span>
          </h2>
          <div className="body">
            <textarea
              rows={5}
              placeholder="Paste post copy here. Separate several posts with a blank line and they'll split into separate blocks."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="row">
              <button className="primary" disabled={busy || !draft.trim()} onClick={() => addCopy(draft)}>
                Add copy
              </button>
              <label className="file" style={{ padding: "8px 14px", flex: "0 0 auto" }}>
                Upload .txt
                <input
                  type="file"
                  accept=".txt,.md,.csv,text/plain"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) await addCopy(await file.text(), file.name);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>

            <ul className="items">
              {copy.map((item) => (
                <li
                  key={item.id}
                  className={item.id === pickedCopy ? "sel" : ""}
                  onClick={() => setPickedCopy(item.id === pickedCopy ? null : item.id)}
                >
                  <div className="grow">
                    <p>{item.text}</p>
                    <div className="meta">{item.label}</div>
                  </div>
                  <button
                    className="x"
                    aria-label="Delete copy"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove("copy", item.id);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
              {copy.length === 0 ? <p className="note">Nothing yet. Paste copy above.</p> : null}
            </ul>
          </div>
        </section>

        {/* ---- photos ---- */}
        <section className="col">
          <h2>
            Photos <span>{photos.length}</span>
          </h2>
          <div className="body">
            <label className="file">
              Drop images here, or click to choose
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  if (event.target.files?.length) void addPhotos(event.target.files);
                }}
              />
            </label>
            <p className="note">Resized to 1600px before upload, so phone photos are fine.</p>

            <div className="grid">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className={`tile${photo.id === pickedPhoto ? " sel" : ""}`}
                  onClick={() => setPickedPhoto(photo.id === pickedPhoto ? null : photo.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.label} />
                  <div className="cap">{photo.label}</div>
                  <button
                    className="x"
                    aria-label="Delete photo"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove("photos", photo.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {photos.length === 0 ? <p className="note">No photos yet.</p> : null}
          </div>
        </section>
      </div>

      {/* ---- pairing tray ---- */}
      <div className="tray">
        <div className="pair">
          {selectedPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedPhoto.url} alt={selectedPhoto.label} />
          ) : null}
          <div className="snippet">
            {selectedCopy ? selectedCopy.text : "Pick a copy block, and a photo if you want one."}
          </div>
        </div>
        <input
          type="text"
          placeholder="Group or town"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <button className="primary" disabled={busy || !pickedCopy} onClick={queuePost}>
          Queue post
        </button>
      </div>

      {/* ---- queue ---- */}
      <section className="queue">
        <h2>Queue · {posts.length}</h2>
        {posts.map((post) => (
          <div className="post" key={post.id}>
            {post.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.photoUrl} alt="" />
            ) : null}
            <div className="txt">
              <p>{post.text}</p>
              <div className="row">
                <span className={`pill ${post.status}`}>{post.status}</span>
                <span className="note">{post.target}</span>
                {post.status === "queued" ? (
                  <button className="ghost" onClick={() => setStatus(post.id, "approved")}>
                    Approve
                  </button>
                ) : null}
                {post.status === "approved" ? (
                  <button className="ghost" onClick={() => setStatus(post.id, "posted")}>
                    Mark posted
                  </button>
                ) : null}
                <button className="ghost" onClick={() => remove("posts", post.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {posts.length === 0 ? <p className="note">Nothing queued yet.</p> : null}
      </section>
    </>
  );
}

/** Shrink in the browser so a 12MP phone photo doesn't hit the upload limit. */
async function downscale(file: File, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.85);
  });
}
