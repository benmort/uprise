import { TxSmsStatus } from "@uprise/db";
import { assertValidTxSmsTransition } from "./tx-sms-state.machine";

describe("tx-sms state machine", () => {
  it.each([
    [TxSmsStatus.PENDING, TxSmsStatus.QUEUED],
    [TxSmsStatus.PENDING, TxSmsStatus.FAILED],
    [TxSmsStatus.QUEUED, TxSmsStatus.SENT],
    [TxSmsStatus.QUEUED, TxSmsStatus.FAILED],
    [TxSmsStatus.SENT, TxSmsStatus.DELIVERED],
    [TxSmsStatus.SENT, TxSmsStatus.UNDELIVERED],
    [TxSmsStatus.SENT, TxSmsStatus.FAILED],
  ])("allows %s → %s", (from, to) => {
    expect(() => assertValidTxSmsTransition(from, to)).not.toThrow();
  });

  it.each([
    [TxSmsStatus.PENDING, TxSmsStatus.SENT],
    [TxSmsStatus.PENDING, TxSmsStatus.DELIVERED],
    [TxSmsStatus.QUEUED, TxSmsStatus.DELIVERED],
    [TxSmsStatus.SENT, TxSmsStatus.QUEUED],
    [TxSmsStatus.DELIVERED, TxSmsStatus.SENT],
    [TxSmsStatus.FAILED, TxSmsStatus.SENT],
    [TxSmsStatus.UNDELIVERED, TxSmsStatus.DELIVERED],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertValidTxSmsTransition(from, to)).toThrow();
  });
});
