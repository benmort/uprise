'use client';

// /inbox renders the default "inbox" folder directly — no redirect. Other folders live
// at /inbox/[folder]; both render the same list via <InboxFolderView/>, which reads the
// folder from the URL (absent here → the default 'inbox' folder). The shell (breadcrumb,
// sidebar, compose) lives in ./layout so it persists across folder ↔ detail navigation.
import InboxFolderView from './folder-view';

export default function InboxPage() {
  return <InboxFolderView />;
}
