export {
  createIpcStorage,
  type DbStorageBridge
} from "./storage/ipc-storage.ts";

export {
  createTabsCollection,
  createTabsRecord,
  isTabsRecord,
  tabsRecordToSnapshot,
  type TabsRecord,
  type TabsSnapshot,
  type TabsTab,
  TABS_RECORD_ID
} from "./collections/tabs.ts";

export {
  createMailboxCollection,
  createMailboxRecord,
  isMailboxRecord,
  mailboxRecordToEntry,
  mailboxRecordId,
  type MailboxEntry,
  type MailboxRecord
} from "./collections/mailbox.ts";

export {
  createUiPreferencesCollection,
  createUiPreferencesRecord,
  isUiPreferencesRecord,
  type UiPreferencesRecord,
  UI_PREFERENCES_RECORD_ID
} from "./collections/ui-preferences.ts";

export {
  createUploadJobsCollection,
  createUploadJobRecord,
  isUploadJobRecord,
  type UploadJobRecord,
  type UploadJobResult,
  type UploadJobStatus
} from "./collections/upload-jobs.ts";

export {
  createRoutingCollection,
  createRoutingRecord,
  isRoutingRecord,
  type RoutingRecord,
  ROUTING_RECORD_ID
} from "./collections/routing.ts";

export {
  isDomainEventPayload,
  parseDomainEventPayload,
  type DomainEventPayload,
  type DomainEventSource,
  isAgentRuntimeEventPayload,
  parseAgentRuntimeEventPayload,
  type AgentModelPayload,
  type AgentProvider,
  type AgentRuntimeEventPayload
} from "./events.ts";
