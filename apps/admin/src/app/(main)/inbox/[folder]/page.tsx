'use client';

// A named folder view (/inbox/[folder], e.g. /inbox/mine). Renders the shared list; the
// folder is read from the URL by <InboxFolderView/>. The default 'inbox' folder is served
// at the bare /inbox (../page.tsx) instead.
import InboxFolderView from '../folder-view';

export default function InboxFolderPage() {
  return <InboxFolderView />;
}
