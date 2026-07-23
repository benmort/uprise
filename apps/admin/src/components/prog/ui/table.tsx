// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Table primitives (same API +
// export names); consumers get repointed to `@uprise/ui`, then this is deleted. Zero regression.
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@uprise/ui";
