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

  it("defaults location to 'your area' when no suburb is known", () => {
    const service = new TemplateRendererService();
    expect(service.render("team in {{location}}", {})).toBe("team in your area");
  });

  it("resolves {{location}} from suburb/locality/city/town aliases", () => {
    const service = new TemplateRendererService();
    expect(service.render("in {{location}}", { suburb: "Glebe" })).toBe("in Glebe");
    expect(service.render("in {{location}}", { locality: "Fitzroy" })).toBe("in Fitzroy");
    expect(service.render("in {{location}}", { city: "Northcote" })).toBe("in Northcote");
    expect(service.render("in {{location}}", { town: "Katoomba" })).toBe("in Katoomba");
  });

  it("prefers an explicit location, then reads the action network postal address locality", () => {
    const service = new TemplateRendererService();
    expect(service.render("in {{location}}", { location: "Brunswick", city: "Melbourne" })).toBe(
      "in Brunswick",
    );
    const rendered = service.render("in {{location}}", {
      actionNetwork: { person: { postal_addresses: [{ locality: "Marrickville" }] } },
    });
    expect(rendered).toBe("in Marrickville");
  });
});
