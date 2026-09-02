import { NextResponse } from "next/server";
import { mutate, newId, readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.posts);
}

/** Pair one copy item with one photo and queue it for the Poster. */
export async function POST(request: Request) {
  const { copyId, photoId, target } = (await request.json()) as {
    copyId?: string;
    photoId?: string | null;
    target?: string;
  };

  const store = await readStore();
  const copy = store.copy.find((item) => item.id === copyId);
  if (!copy) return NextResponse.json({ error: "Pick a copy block first." }, { status: 400 });

  const photo = photoId ? store.photos.find((item) => item.id === photoId) : undefined;
  if (photoId && !photo) return NextResponse.json({ error: "That photo is gone." }, { status: 400 });

  const post = {
    id: newId(),
    copyId: copy.id,
    photoId: photo?.id ?? null,
    text: copy.text,
    photoUrl: photo?.url ?? null,
    target: (target ?? "").trim() || "unassigned",
    status: "queued" as const,
    createdAt: new Date().toISOString(),
  };

  const next = await mutate((data) => ({ ...data, posts: [post, ...data.posts] }));
  return NextResponse.json({ post, posts: next.posts });
}

export async function PATCH(request: Request) {
  const { id, status } = (await request.json()) as { id?: string; status?: string };
  if (!id || !["queued", "approved", "posted"].includes(status ?? "")) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }
  const next = await mutate((data) => ({
    ...data,
    posts: data.posts.map((post) =>
      post.id === id ? { ...post, status: status as typeof post.status } : post,
    ),
  }));
  return NextResponse.json({ posts: next.posts });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const next = await mutate((data) => ({ ...data, posts: data.posts.filter((p) => p.id !== id) }));
  return NextResponse.json({ posts: next.posts });
}
