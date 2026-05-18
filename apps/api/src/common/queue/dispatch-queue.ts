export type DispatchQueueName = "audience-import" | "blast-send" | "blast-retry";

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
