"use client";

export default function SignOut() {
  return (
    <button
      className="ghost"
      onClick={async () => {
        await fetch("/api/auth", { method: "DELETE" });
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
