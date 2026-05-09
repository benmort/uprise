import { Injectable } from "@nestjs/common";
import Handlebars from "handlebars";

@Injectable()
export class TemplateRendererService {
  render(template: string, context: Record<string, unknown>): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(context ?? {});
  }
}
