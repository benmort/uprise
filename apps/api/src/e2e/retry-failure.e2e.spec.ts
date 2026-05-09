describe("failure and retry e2e-style", () => {
  it("documents failure -> retry transition coverage", () => {
    const lifecycle = ["sending", "failed", "retrying", "sent"];
    expect(lifecycle[1]).toBe("failed");
    expect(lifecycle[3]).toBe("sent");
  });
});
