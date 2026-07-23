// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Radix RadioGroup (same API);
// consumers get repointed to `@uprise/ui`, then this is deleted. Zero functional regression.
export { RadioGroup, RadioGroupItem } from "@uprise/ui";
