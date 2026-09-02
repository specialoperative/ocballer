export const dynamic = "force-dynamic";

export default function Login({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <main className="login">
      <h1>Poach Studio</h1>
      <p>Operator access.</p>
      <form method="POST" action="/api/auth">
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          required
        />
        {searchParams.e ? <p className="err">Wrong password.</p> : null}
        <button className="primary" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}
