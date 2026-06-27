import { Card, CardContent } from "@uprise/ui";

/** Bare index — joining is per-workspace via /join/[slug]. */
export default function HomePage() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <h1 className="text-xl font-semibold">Uprise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          To request access, open the join link your organisation shared with you.
        </p>
      </CardContent>
    </Card>
  );
}
