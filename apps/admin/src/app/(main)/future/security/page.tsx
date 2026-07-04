import { ProtectedRoute } from "@/components/prog/protected-route";
import { SecuritySettings } from "@/components/settings/security";

// Security also lives as a tab on the General settings page; this standalone route
// renders the same component so any direct links keep working.
export default function SecurityPage() {
  return (
    <ProtectedRoute>
      <section className="flex-1">
        <div className="page-stack">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage your password, active sessions and account.</p>
          </div>
          <SecuritySettings />
        </div>
      </section>
    </ProtectedRoute>
  );
}
