import { request } from "@/lib/api";
import type { SupportLevel } from "@/lib/api/contacts";

export type QuestionType = "yes_no" | "single_choice" | "multi_choice" | "text" | "scale";

export type SurveyOption = {
  id?: string;
  value: string;
  label: string;
  orderIndex?: number;
  dispositionCode?: string | null;
  supportLevel?: SupportLevel | null;
  cannedReplyText?: string | null;
};

export type SurveyQuestion = {
  id?: string;
  prompt: string;
  type: QuestionType;
  orderIndex?: number;
  required?: boolean;
  scaleMin?: number | null;
  scaleMax?: number | null;
  options?: SurveyOption[];
};

export type Survey = { id: string; name: string; questions: SurveyQuestion[] };
export type SurveyListItem = {
  id: string;
  name: string;
  campaignId: string | null;
  questionCount: number;
  updatedAt: string;
};

export async function listSurveys() {
  return request<SurveyListItem[]>("/engagement/surveys");
}
export async function getSurvey(id: string) {
  return request<Survey>(`/engagement/surveys/${encodeURIComponent(id)}`);
}
export async function createSurvey(input: { name: string; questions?: SurveyQuestion[] }) {
  return request<Survey>("/engagement/surveys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
export async function updateSurvey(id: string, input: { name?: string; questions?: SurveyQuestion[] }) {
  return request<Survey>(`/engagement/surveys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
export async function deleteSurvey(id: string) {
  return request<{ archived: boolean }>(`/engagement/surveys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type ScriptStep = { id?: string; bodyText: string; outcomeKey?: string | null; orderIndex?: number };
export type Script = { id: string; name: string; channel: string; steps: ScriptStep[] };
export type ScriptListItem = { id: string; name: string; channel: string; stepCount: number; updatedAt: string };

export async function listScripts() {
  return request<ScriptListItem[]>("/engagement/scripts");
}
export async function getScript(id: string) {
  return request<Script>(`/engagement/scripts/${encodeURIComponent(id)}`);
}
export async function createScript(input: { name: string; channel?: string; steps?: ScriptStep[] }) {
  return request<Script>("/engagement/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
export async function updateScript(id: string, input: { name?: string; steps?: ScriptStep[] }) {
  return request<Script>(`/engagement/scripts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
export async function deleteScript(id: string) {
  return request<{ archived: boolean }>(`/engagement/scripts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
