import SignOut from "@/components/SignOut";
import Workspace from "@/components/Workspace";
import { isConfigured, readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = isConfigured();
  const store = configured ? await readStore() : { copy: [], photos: [], posts: [] };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          Poach <span>Studio</span>
        </div>
        <SignOut />
      </header>

      {!configured ? (
        <div className="setup">
          <h3>One setup step left</h3>
          <p className="note">
            Uploads need a Blob store. Nothing you add will save until it exists.
          </p>
          <ol>
            <li>Vercel dashboard → this project → <strong>Storage</strong> → Create → <strong>Blob</strong>.</li>
            <li>Connect it to this project. Vercel sets <code>BLOB_READ_WRITE_TOKEN</code> for you.</li>
            <li>Redeploy, and this banner disappears.</li>
          </ol>
        </div>
      ) : null}

      <Workspace
        initialCopy={store.copy}
        initialPhotos={store.photos}
        initialPosts={store.posts}
        configured={configured}
      />
    </div>
  );
}
