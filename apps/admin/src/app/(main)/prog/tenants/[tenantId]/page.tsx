'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';
import { AdminOrHigher } from '@/components/prog/protected-route';
import { useRouter, useParams } from 'next/navigation';
import { Building2, Users, ArrowLeft } from 'lucide-react';

type TenantDetail = {
  id: string;
  subdomain: string;
  displayName?: string;
  networkId?: number;
  parentTenantId?: number | null;
  createdAt?: string;
};

const MOCK_TENANT: TenantDetail = {
  id: 'tn_nsw',
  subdomain: 'getup-nsw',
  displayName: 'GetUp NSW',
  networkId: 1,
  parentTenantId: 1,
  createdAt: '2025-03-04T00:00:00.000Z',
};

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.tenantId as string;
  const [tenant] = useState<TenantDetail | null>({ ...MOCK_TENANT, id: tenantId || MOCK_TENANT.id });
  const [loading] = useState(false);

  if (loading) {
    return (
      <AdminOrHigher>
        <section className="page-stack">
          <div className="text-gray-600 dark:text-gray-400">Loading...</div>
        </section>
      </AdminOrHigher>
    );
  }

  if (!tenant) {
    return (
      <AdminOrHigher>
        <section className="page-stack">
          <p className="text-muted-foreground">Tenant not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/tenants')}>
            Back to Tenants
          </Button>
        </section>
      </AdminOrHigher>
    );
  }

  return (
    <AdminOrHigher>
      <section className="page-stack">
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/tenants')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tenant.displayName || tenant.subdomain}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">Tenant details</p>
          </div>

          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Subdomain</Label>
                <Input value={tenant.subdomain} readOnly className="mt-1 bg-gray-50 dark:bg-gray-900" />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input value={tenant.displayName || ''} readOnly className="mt-1 bg-gray-50 dark:bg-gray-900" />
              </div>
              <div>
                <Label>Type</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {tenant.parentTenantId == null || tenant.parentTenantId === Number(tenant.id)
                    ? 'Root tenant'
                    : 'Child tenant'}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={() => router.push(`/admin/tenants/${tenantId}/members`)}>
              <Users className="h-4 w-4 mr-2" />
              Manage Members
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin/tenant/settings')}>
              Tenant Settings
            </Button>
          </div>
        </div>
      </section>
    </AdminOrHigher>
  );
}
