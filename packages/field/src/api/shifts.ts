// Field-facing volunteer shift calls (browse open shifts, self-signup, release).
// Thin cookie-auth wrappers over the shared `request`, mirroring the self-serve turf
// calls in ./canvass. Organiser shift management stays in apps/admin/src/lib/api.ts.
import { request } from "@uprise/api-client";

export type ShiftType = "CANVASS" | "POLLING_BOOTH" | "EVENT" | "GENERAL";
export type ShiftAssignmentStatus = "REQUESTED" | "ASSIGNED" | "RELEASED";

/** An open shift for the "pick a shift" screen: seat counts + this volunteer's own seat. */
export type AvailableShift = {
  id: string;
  campaignId: string | null;
  type: ShiftType;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  assignedCount: number;
  isFull: boolean;
  /** REQUESTED / ASSIGNED if the volunteer already holds a seat, else null. */
  mine: ShiftAssignmentStatus | null;
};

export type MyShift = {
  assignmentId: string;
  status: ShiftAssignmentStatus;
  shift: {
    id: string;
    campaignId: string | null;
    type: ShiftType;
    name: string;
    location: string | null;
    startsAt: string;
    endsAt: string;
  };
};

export async function getAvailableShifts(campaignId: string) {
  return request<AvailableShift[]>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/shifts/available`,
  );
}

export async function getMyShifts() {
  return request<MyShift[]>(`/canvass/my-shifts`);
}

export async function signUpShift(campaignId: string, shiftId: string) {
  return request<{ id: string; status: ShiftAssignmentStatus }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/shifts/${encodeURIComponent(shiftId)}/sign-up`,
    { method: "POST" },
  );
}

export async function releaseShift(campaignId: string, shiftId: string) {
  return request<{ id: string; status: ShiftAssignmentStatus }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/shifts/${encodeURIComponent(shiftId)}/release`,
    { method: "POST" },
  );
}
