// Retiring prog/ui → @uprise/ui. Thin re-export of the shared Card family (CardDescription +
// CardAction were added to the shared Card to cover prog's surface). Layout harmonises to the
// design system. Consumers get repointed to `@uprise/ui` next, then this is deleted.
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "@uprise/ui";
