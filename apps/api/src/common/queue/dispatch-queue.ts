export type DispatchQueueName =
  | "audience-import"
  | "blast-send"
  | "blast-retry"
  | "integration-sync"
  | "journey-run"
  | "segment-eval"
  | "turf-estimate"
  | "heat-run"
  | "domain-events";

export type DispatchQueueJob<TPayload> = {
  id: string;
  queue: DispatchQueueName;
  type: string;
  payload: TPayload;
  runAt?: Date;
  attempts?: number;
  backoffMs?: number;
  removeOnComplete?: boolean | number;
};

export type DispatchEnqueueResult = {
  jobId: string;
  queued: boolean;
};

export interface DispatchQueue {
  enqueue<TPayload>(job: DispatchQueueJob<TPayload>): Promise<DispatchEnqueueResult>;
}
