// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Radix Switch — its
// checked/onCheckedChange/disabled/className API is a superset of prog's SwitchProps, so
// consumers keep working. Repointed to `@uprise/ui` next, then deleted. Zero functional regression.
export { Switch } from "@uprise/ui";
