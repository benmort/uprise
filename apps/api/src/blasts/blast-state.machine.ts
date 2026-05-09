import { BlastStatus } from "../common/enums/blast-status.enum";
import { ApiHttpException } from "../common/http/api-response";

const allowed: Record<BlastStatus, BlastStatus[]> = {
  [BlastStatus.DRAFTED]: [BlastStatus.PROOFED, BlastStatus.SCHEDULED, BlastStatus.SENDING, BlastStatus.FAILED],
  [BlastStatus.PROOFED]: [BlastStatus.SCHEDULED, BlastStatus.SENDING, BlastStatus.FAILED],
  [BlastStatus.SCHEDULED]: [BlastStatus.SENDING, BlastStatus.FAILED],
  [BlastStatus.SENDING]: [BlastStatus.SENT, BlastStatus.FAILED],
  [BlastStatus.SENT]: [],
  [BlastStatus.FAILED]: [BlastStatus.SENDING],
};

export function assertValidBlastTransition(from: BlastStatus, to: BlastStatus): void {
  if (!allowed[from]?.includes(to)) {
    throw new ApiHttpException(
      "INVALID_BLAST_TRANSITION",
      `Cannot transition blast from ${from} to ${to}`,
      409,
    );
  }
}
