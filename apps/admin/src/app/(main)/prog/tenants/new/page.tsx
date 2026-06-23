'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';
import { AdminOrHigher } from '@/components/prog/protected-route';
import { useRouter } from 'next/navigation';

export default function NewTenantPage() {
  const [subdomain, setSubdomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [parentTenantId, setParentTenantId] = useState<string | null>(null);
  const [isSubmitting] = useState(false);
  const [error] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <AdminOrHigher>
      <section className="flex-1 p-4 lg:p-8">
        <div className="max-w-xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Tenant</h1>
            <p className="text-gray-600 dark:text-gray-400">Add a new tenant to your network</p>
          </div>

          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
            <CardHeader>
              <CardTitle>Tenant Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="subdomain">Subdomain</Label>
                  <Input
                    id="subdomain"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    placeholder="e.g. my-tenant"
                    required
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
                </div>
                <div>
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. My Tenant"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="parentTenantId">Parent Tenant (optional)</Label>
                  <Input
                    id="parentTenantId"
                    value={parentTenantId ?? ''}
                    onChange={(e) => setParentTenantId(e.target.value || null)}
                    placeholder="Leave empty for root tenant"
                    className="mt-1"
                  />
                </div>
                {error && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-500/15 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Create Tenant'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </AdminOrHigher>
  );
}
