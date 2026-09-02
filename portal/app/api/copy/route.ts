import { NextResponse } from "next/server";
import { mutate, newId, readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.copy);
}

export async function POST(request: Request) {
  const { text, label } = (await request.json()) as { text?: string; label?: string };
  const body = (text ?? "").trim();
  if (!body) return NextResponse.json({ error: "Copy can't be empty." }, { status: 400 });

  // A pasted block separated by blank lines is several posts, not one.
  const blocks = body.includes("\n\n") ? body.split(/\n{2,}/) : [body];
  const created = blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      id: newId(),
      text: block,
      label: (label ?? "").trim() || `Draft ${index + 1}`,
      createdAt: new Date().toISOString(),
    }));

  const store = await mutate((data) => ({ ...data, copy: [...created, ...data.copy] }));
  return NextResponse.json({ added: created.length, copy: store.copy });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const store = await mutate((data) => ({ ...data, copy: data.copy.filter((item) => item.id !== id) }));
  return NextResponse.json({ copy: store.copy });
}
