import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

/**
 * Placeholder for ported prog pages that are not yet built out. Mirrors prog's
 * 37-line "Coming Soon" stub as a single reusable component so the ~40 stub
 * routes stay one-liners. Styling matches the rest of the ported /prog/* island
 * (prog's gray/dark Tailwind classes) rather than yarns semantic tokens.
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        {description ? (
          <p className="text-gray-600 dark:text-gray-400">{description}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Construction className="h-8 w-8 text-gray-400" aria-hidden />
          </div>
          <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">Coming soon</h3>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            This page is under development. Check back soon for updates.
          </p>
        </div>
      </div>
    </div>
  );
}
