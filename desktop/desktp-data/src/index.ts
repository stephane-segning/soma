export {
  createIpcStorage,
  type DbStorageBridge
} from "./storage/ipc-storage";

export {
  createTabsCollection,
  createTabsRecord,
  isTabsRecord,
  tabsRecordToSnapshot,
  type TabsRecord,
  type TabsSnapshot,
  type TabsTab,
  TABS_RECORD_ID
} from "./collections/tabs";

export {
  createMailboxCollection,
  createMailboxRecord,
  isMailboxRecord,
  mailboxRecordToEntry,
  mailboxRecordId,
  type MailboxEntry,
  type MailboxRecord
} from "./collections/mailbox";

export {
  createUiPreferencesCollection,
  createUiPreferencesRecord,
  isUiPreferencesRecord,
  type UiPreferencesRecord,
  UI_PREFERENCES_RECORD_ID
} from "./collections/ui-preferences";

export {
  createUploadJobsCollection,
  createUploadJobRecord,
  isUploadJobRecord,
  type UploadJobRecord,
  type UploadJobResult,
  type UploadJobStatus
} from "./collections/upload-jobs";

export {
  createRoutingCollection,
  createRoutingRecord,
  isRoutingRecord,
  type RoutingRecord,
  ROUTING_RECORD_ID
} from "./collections/routing";
