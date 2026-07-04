import Link from "next/link";

/** App-level 404 – unknown routes previously fell through with no page at all. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-5xl font-extrabold text-muted-foreground">404</p>
        <h1 className="mt-3 text-xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&rsquo;t exist (or moved). The sidebar has everything that does.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
