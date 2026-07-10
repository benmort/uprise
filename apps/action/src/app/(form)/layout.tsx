/** Centred single-card chrome for the form flows (home, /join/[slug]). */
export default function FormLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
