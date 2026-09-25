import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { mutate, newId, readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.photos);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  // The browser downscales before sending, so this only catches pathological
  // uploads — but a serverless body over ~4.5MB fails opaquely otherwise.
  if (file.size > 4_000_000) {
    return NextResponse.json(
      { error: "That image is still over 4MB after resizing. Try a smaller one." },
      { status: 413 },
    );
  }

  const id = newId();
  const blob = await put(`photos/${id}.jpg`, file, {
    access: "public",
    contentType: file.type || "image/jpeg",
    addRandomSuffix: false,
  });

  const photo = {
    id,
    url: blob.url,
    label: String(form.get("label") ?? "") || file.name || "Photo",
    createdAt: new Date().toISOString(),
  };

  const store = await mutate((data) => ({ ...data, photos: [photo, ...data.photos] }));
  return NextResponse.json({ photo, photos: store.photos });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const store = await mutate((data) => ({
    ...data,
    photos: data.photos.filter((item) => item.id !== id),
  }));
  return NextResponse.json({ photos: store.photos });
}
