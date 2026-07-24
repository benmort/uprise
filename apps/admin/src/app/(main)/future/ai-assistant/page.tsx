import { redirect } from "next/navigation";

// The AI assistant moved to /future/ai/assistant (with its settings hub under
// /future/ai/settings/*). This legacy path keeps old bookmarks working.
export default function AiAssistantRedirect() {
  redirect("/future/ai/assistant");
}
