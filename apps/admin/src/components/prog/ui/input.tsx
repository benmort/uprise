// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Input (same `<input>` API);
// consumers get repointed to `@uprise/ui`, then this is deleted. Zero functional regression.
export { Input } from "@uprise/ui";
