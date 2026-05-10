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

    return {
      ...source,
      first_name: firstName,
      firstname: firstName,
      firstName,
    };
  }

  render(template: string, context: Record<string, unknown>): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(this.normalizeContext(context));
  }
}
