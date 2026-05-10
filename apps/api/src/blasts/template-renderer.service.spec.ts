import { TemplateRendererService } from "./template-renderer.service";

describe("TemplateRendererService", () => {
  it("defaults first_name to friend when missing", () => {
    const service = new TemplateRendererService();
    const rendered = service.render("Hi {{first_name}}", {});
    expect(rendered).toBe("Hi friend");
  });

  it("supports firstname alias in templates", () => {
    const service = new TemplateRendererService();
    const rendered = service.render("Hi {{firstname}}", { first_name: "Ava" });
    expect(rendered).toBe("Hi Ava");
  });

  it("uses nested action network first name when present", () => {
    const service = new TemplateRendererService();
    const rendered = service.render("Hi {{first_name}}", {
      actionNetwork: {
        person: {
          given_name: "Taylor",
        },
      },
    });
    expect(rendered).toBe("Hi Taylor");
  });
});
