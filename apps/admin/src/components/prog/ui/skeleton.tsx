// Retiring prog/ui → @uprise/ui. This is now a thin re-export of the shared design-system
// Skeleton, so existing `@/components/prog/ui/skeleton` imports keep working (zero regression)
// while prog/ui is dismantled. Consumers get repointed to `@uprise/ui` next, then this is deleted.
export { Skeleton } from "@uprise/ui";
