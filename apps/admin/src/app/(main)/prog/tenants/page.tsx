'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Badge } from '@/components/prog/ui/badge';
import {
  Building2,
  Plus,
  Users,
  Calendar,
  MoreHorizontal,
  Settings,
  GitBranch,
} from 'lucide-react';
import { AdminOrHigher } from '@/components/prog/protected-route';
import { useRouter } from 'next/navigation';

type TenantListItem = {
  id: string;
  subdomain: string;
  displayName?: string;
  parentTenantId?: string | number | null;
  createdAt?: string;
};

const MOCK_TENANTS: TenantListItem[] = [
  {
    id: 'tn_root',
    subdomain: 'getup',
    displayName: 'GetUp',
    parentTenantId: null,
    createdAt: '2025-01-12T00:00:00.000Z',
  },
  {
    id: 'tn_nsw',
    subdomain: 'getup-nsw',
    displayName: 'GetUp NSW',
    parentTenantId: 'tn_root',
    createdAt: '2025-03-04T00:00:00.000Z',
  },
  {
    id: 'tn_vic',
    subdomain: 'getup-vic',
    displayName: 'GetUp Victoria',
    parentTenantId: 'tn_root',
    createdAt: '2025-04-21T00:00:00.000Z',
  },
];

function buildTenantTree(tenants: TenantListItem[]) {
  const byId = new Map<string | number, TenantListItem & { children: TenantListItem[] }>();
  tenants.forEach((t) => byId.set(t.id, { ...t, children: [] }));

  const roots: (TenantListItem & { children: TenantListItem[] })[] = [];
  tenants.forEach((t) => {
    const node = byId.get(t.id)!;
    const parentId = t.parentTenantId;
    if (parentId == null || parentId === t.id) {
      roots.push(node);
    } else {
      const parent = byId.get(String(parentId));
      if (parent) (parent as any).children.push(node);
      else roots.push(node);
    }
  });
  return roots;
}

function TenantHierarchyMermaid({ tenants }: { tenants: TenantListItem[] }) {
  const roots = useMemo(() => buildTenantTree(tenants), [tenants]);
  if (roots.length === 0) return null;

  const lines: string[] = [];
  const seen = new Set<string>();
  function visit(node: TenantListItem & { children?: TenantListItem[] }) {
    const safeId = `T${String(node.id).replace(/[^a-zA-Z0-9_]/g, '_')}`;
    if (!seen.has(safeId)) {
      seen.add(safeId);
      const label = (node.displayName || node.subdomain || String(node.id)).replace(/"/g, "'");
      lines.push(`  ${safeId}["${label}"]`);
    }
    (node.children || []).forEach((c) => {
      const childId = `T${String(c.id).replace(/[^a-zA-Z0-9_]/g, '_')}`;
      lines.push(`  ${safeId} --> ${childId}`);
      visit(c as any);
    });
  }
  roots.forEach(visit);

  const mermaidCode = `flowchart TD\n${lines.join('\n')}`;
  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Tenant Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs overflow-x-auto p-4 bg-gray-50 dark:bg-gray-900 rounded-lg font-mono">
          {mermaidCode}
        </pre>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Copy the above into <a href="https://mermaid.live" target="_blank" rel="noreferrer" className="underline">mermaid.live</a> to view the diagram.
        </p>
      </CardContent>
    </Card>
  );
}

export default function TenantsPage() {
  const [tenants] = useState<TenantListItem[]>(MOCK_TENANTS);
  const [loading] = useState(false);
  const [message] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  const formatDate = (dateString?: string) => {
    if (!dateString) return '–';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <AdminOrHigher>
      <section className="page-stack">
        <div className="contents">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenants</h1>
              <p className="text-gray-600 dark:text-gray-400">Manage tenants in your network</p>
            </div>
            <Button
              onClick={() => router.push('/admin/tenants/new')}
              className="bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </div>

          {message && (
            <div
              className={`p-3 rounded-md border ${
                message.type === 'success'
                  ? 'bg-green-50 dark:bg-green-500/15 text-green-800 dark:text-green-400 border-green-200 dark:border-green-500/20'
                  : 'bg-red-50 dark:bg-red-500/15 text-red-800 dark:text-red-400 border-red-200 dark:border-red-500/20'
              }`}
            >
              {message.text}
            </div>
          )}

          {tenants.length > 0 && <TenantHierarchyMermaid tenants={tenants} />}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-600 dark:text-gray-400">Loading tenants...</div>
            </div>
          ) : tenants.length === 0 ? (
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No tenants yet</h3>
                <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                  Create your first tenant to get started.
                </p>
                <Button
                  onClick={() => router.push('/admin/tenants/new')}
                  className="bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Tenant
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tenants.map((t) => (
                <Card
                  key={t.id}
                  className="hover:shadow-md transition-shadow border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-lg">
                          <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                            {t.displayName || t.subdomain}
                          </CardTitle>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {t.parentTenantId == null || t.parentTenantId === t.id ? 'Root' : 'Child'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Subdomain:</span> {t.subdomain}
                      </div>
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Calendar className="h-4 w-4 mr-2" />
                        Created {formatDate(t.createdAt)}
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/tenants/${t.id}`)}
                          className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/tenants/${t.id}/members`)}
                          className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Users className="h-4 w-4 mr-1" />
                          Members
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminOrHigher>
  );
}
