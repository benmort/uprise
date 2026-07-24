import { Injectable } from "@nestjs/common";
import Handlebars from "handlebars";

@Injectable()
export class TemplateRendererService {
  private pickFirstNonEmptyString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    return null;
  }

  private normalizeContext(context: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const source = context ?? {};
    const nestedActionNetworkPerson =
      source.actionNetwork &&
      typeof source.actionNetwork === "object" &&
      !Array.isArray(source.actionNetwork) &&
      (source.actionNetwork as Record<string, unknown>).person &&
      typeof (source.actionNetwork as Record<string, unknown>).person === "object" &&
      !Array.isArray((source.actionNetwork as Record<string, unknown>).person)
        ? ((source.actionNetwork as Record<string, unknown>).person as Record<string, unknown>)
        : null;

    const firstName =
      this.pickFirstNonEmptyString(
        source.first_name,
        source.firstname,
        source.firstName,
        nestedActionNetworkPerson?.given_name,
        nestedActionNetworkPerson?.first_name,
      ) ?? "friend";

    // {{location}} = the recipient's suburb. Different imports name the column differently
    // (suburb/locality/city/town) and Action Network nests it on the person's postal address,
    // so accept any of them; fall back to a natural phrase when we don't know their suburb.
    const actionNetworkAddress =
      nestedActionNetworkPerson && Array.isArray(nestedActionNetworkPerson.postal_addresses)
        ? (nestedActionNetworkPerson.postal_addresses[0] as Record<string, unknown> | undefined)
        : undefined;
    const location =
      this.pickFirstNonEmptyString(
        source.location,
        source.suburb,
        source.locality,
        source.city,
        source.town,
        actionNetworkAddress?.locality,
      ) ?? "your area";

    return {
      ...source,
      first_name: firstName,
      firstname: firstName,
      firstName,
      location,
    };
  }

  render(template: string, context: Record<string, unknown>): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(this.normalizeContext(context));
  }
}
