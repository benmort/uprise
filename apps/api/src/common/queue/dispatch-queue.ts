export type DispatchQueueJob<TPayload> = {
  id: string;
  type: string;
  payload: TPayload;
  runAt?: Date;
};

export interface DispatchQueue {
  enqueue<TPayload>(job: DispatchQueueJob<TPayload>): Promise<void>;
}
