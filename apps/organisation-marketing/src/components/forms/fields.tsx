/**
 * Labs-styled form primitives (the design's field language): mono uppercase
 * labels, borderless inputs with a 1.5px bottom border that turns vermilion on
 * focus, fully-bordered textareas, and pill buttons in three variants.
 * Deliberately local — the @uprise/ui form components depend on the product DS
 * globals this app doesn't load.
 */

const labelClass =
  "mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-ink/60";

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border-0 border-b-[1.5px] border-ink/25 bg-transparent px-0 py-2.5 text-[17px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-vermilion ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-card border border-ink/25 bg-transparent p-3 text-[17px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-vermilion ${props.className ?? ""}`}
    />
  );
}

const buttonVariants = {
  primary:
    "bg-vermilion text-cream hover:bg-ink hover:text-cream",
  dark: "bg-ink text-cream hover:bg-vermilion hover:text-cream",
  outline:
    "border border-ink/25 text-ink hover:bg-ink hover:text-cream",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3.5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className ?? ""}`}
    />
  );
}
