import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export type RealtimeEvent = {
  type: string;
  /** Owning tenant — the SSE stream is filtered to the subscriber's tenant on this field,
   *  so it MUST be set on every emit (no cross-tenant delivery). */
  tenantId: string;
  payload: Record<string, unknown>;
  at: string;
};

@Injectable()
export class RealtimeEventsService {
  private readonly subject = new Subject<RealtimeEvent>();

  get stream() {
    return this.subject.asObservable();
  }

  emit(type: string, tenantId: string, payload: Record<string, unknown>): void {
    this.subject.next({
      type,
      tenantId,
      payload,
      at: new Date().toISOString(),
    });
  }
}
