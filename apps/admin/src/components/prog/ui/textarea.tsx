// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Textarea (same `<textarea>` API);
// `TextareaProps` alias kept for existing type imports. Repointed to `@uprise/ui` next, then deleted.
import type * as React from "react";

export { Textarea } from "@uprise/ui";
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
