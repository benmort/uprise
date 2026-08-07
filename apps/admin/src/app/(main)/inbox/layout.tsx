'use client';

// Shared Inbox folder shell — the breadcrumb, sidebar and compose modal live here once
// (they persist across list ↔ detail navigation). The folder is a URL path segment; the
// list/detail pages render only the main content pane (`xl:col-span-9`) as children.
import { useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { createBlastAndOpen } from '@/lib/blasts';
import { NewConversationMenu } from '@/components/inbox/new-conversation-menu';
import { PageHeader } from '@/components/shell/page-header';
import { FullscreenButton, FullscreenExitCue, useCssFullscreen } from '@/components/ui/fullscreen-button';
import SharedInboxSidebar from '@/components/prog/shared-inbox/sidebar';
import { folderLabel } from './conversations';

export default function SharedInboxFolderLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const folder = String(params.folder ?? 'inbox');
  const [composeOpen, setComposeOpen] = useState(false);
  // Full-screen the inbox pane (sidebar + conversation) — CSS overlay (not the native API) so
  // popovers/menus stay on top; !transform-none below frees the fixed overlay from page-stack.
  const inboxRef = useRef<HTMLDivElement>(null);
  const fs = useCssFullscreen(inboxRef);

  return (
    <div className={cn("page-stack", fs.isFullscreen && "!transform-none")}>
      <div>
        <PageHeader
          icon={Inbox}
          title="Inbox"
          description="Every conversation across your channels, in one queue."
          className="mb-6"
          breadcrumbs={
            folder === 'inbox'
              ? "auto"
              : [
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'Inbox', href: '/inbox' },
                  { label: folderLabel(folder) },
                ]
          }
          titleAccessory={<FullscreenButton isFullscreen={fs.isFullscreen} onToggle={fs.toggle} />}
        />

        <div
          ref={inboxRef}
          className={cn(
            "relative sm:h-[calc(100vh-174px)] h-screen xl:h-[calc(100vh-186px)]",
            fs.isFullscreen && "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background p-4",
          )}
        >
          {fs.isFullscreen ? <FullscreenExitCue onExit={fs.toggle} /> : null}
          <div
            className={cn(
              "xl:grid xl:grid-cols-12 flex flex-col gap-5 sm:gap-5",
              // In fullscreen the panes stack + stretch to fill: the grid takes the remaining
              // height and its single row becomes 1fr so both columns fill the screen.
              fs.isFullscreen && "min-h-0 flex-1 xl:h-full xl:[grid-template-rows:minmax(0,1fr)] [&>*]:min-h-0",
            )}
          >
            <SharedInboxSidebar onCompose={() => setComposeOpen(true)} />
            <NewConversationMenu
              open={composeOpen}
              onClose={() => setComposeOpen(false)}
              onPick={(ch) => {
                if (ch === 'sms') void createBlastAndOpen(router, showToast, { channel: 'SMS' });
                else if (ch === 'whatsapp') void createBlastAndOpen(router, showToast, { channel: 'WHATSAPP' });
                else if (ch === 'call') router.push('/channels/calls?new=1');
                else if (ch === 'event') router.push('/events');
                else if (ch === 'canvass') router.push('/canvass/new');
                else if (ch === 'autodialer') router.push('/autodialer?new=1');
              }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

