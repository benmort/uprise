import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export type RealtimeEvent = {
  type: string;
  payload: Record<string, unknown>;
  at: string;
};

@Injectable()
export class RealtimeEventsService {
  private readonly subject = new Subject<RealtimeEvent>();

  get stream() {
    return this.subject.asObservable();
  }

  emit(type: string, payload: Record<string, unknown>): void {
    this.subject.next({
      type,
      payload,
      at: new Date().toISOString(),
    });
  }
}
