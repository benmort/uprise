// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Button — its variants (incl.
// the newly-added `link`) and sizes cover every prog usage. Heights harmonise (h-9 → h-11).
// Consumers get repointed to `@uprise/ui` next, then this is deleted. No functional regression.
export { Button, buttonVariants } from "@uprise/ui";
