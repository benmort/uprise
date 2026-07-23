// Retiring prog/ui → @uprise/ui. The shared Alert has the identical API (variant/title/
// message/children/showLink…), plus a superset (dismissible, optional title), so this is a
// thin re-export — existing `import Alert from "@/components/prog/ui/alert"` keeps working
// (zero regression). Consumers get repointed to `@uprise/ui` next, then this is deleted.
export { Alert as default, type AlertProps, type AlertVariant } from "@uprise/ui";
