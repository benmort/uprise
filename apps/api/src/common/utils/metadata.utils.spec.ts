import { sanitizeMetadata, withDefaultContactable } from "./metadata.utils";

describe("withDefaultContactable", () => {
  it("defaults contactable to true when missing", () => {
    const metadata = withDefaultContactable(
      sanitizeMetadata({
        city: "Sydney",
      }),
    );

    expect(metadata).toEqual(
      expect.objectContaining({
        city: "Sydney",
        contactable: true,
      }),
    );
  });

  it("defaults contactable to true when null", () => {
    const metadata = withDefaultContactable(
      sanitizeMetadata({
        contactable: null,
      }),
    );

    expect(metadata.contactable).toBe(true);
  });

  it("preserves explicit false", () => {
    const metadata = withDefaultContactable(
      sanitizeMetadata({
        contactable: false,
      }),
    );

    expect(metadata.contactable).toBe(false);
  });

  it("preserves explicit true", () => {
    const metadata = withDefaultContactable(
      sanitizeMetadata({
        contactable: true,
      }),
    );

    expect(metadata.contactable).toBe(true);
  });
});
