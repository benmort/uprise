export function ContentPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </main>
  );
}
