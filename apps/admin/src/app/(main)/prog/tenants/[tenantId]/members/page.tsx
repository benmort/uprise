'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { AdminOrHigher } from '@/components/prog/protected-route';
import { useRouter, useParams } from 'next/navigation';
import { Users, ArrowLeft } from 'lucide-react';

const MOCK_MEMBERS: Array<{ id: string; userId: string; role: string }> = [
  { id: 'm1', userId: 'asha.patel@getup.org.au', role: 'owner' },
  { id: 'm2', userId: 'liam.nguyen@getup.org.au', role: 'admin' },
  { id: 'm3', userId: 'mia.roberts@getup.org.au', role: 'member' },
  { id: 'm4', userId: 'noah.williams@getup.org.au', role: 'viewer' },
];

export default function TenantMembersPage() {
  const [members] = useState<Array<{ id: string; userId: string; role: string }>>(MOCK_MEMBERS);
  const [loading] = useState(false);
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.tenantId as string;

  return (
    <AdminOrHigher>
      <section className="page-stack">
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/tenants/${tenantId}`)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenant Members</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage members for this tenant</p>
          </div>

          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400">Loading...</div>
              ) : members.length === 0 ? (
                <p className="text-muted-foreground">No members yet.</p>
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800 last:border-0">
                      <span className="text-gray-900 dark:text-white">{m.userId}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{m.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </AdminOrHigher>
  );
}
