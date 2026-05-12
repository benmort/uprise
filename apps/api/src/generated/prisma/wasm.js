
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AppUserScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  email: 'email',
  displayName: 'displayName',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  createdById: 'createdById',
  name: 'name',
  source: 'source',
  status: 'status',
  externalListId: 'externalListId',
  syncedAt: 'syncedAt',
  archivedAt: 'archivedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceContactScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  audienceId: 'audienceId',
  externalId: 'externalId',
  phoneE164: 'phoneE164',
  fullName: 'fullName',
  metadata: 'metadata',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceImportScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  audienceId: 'audienceId',
  fileName: 'fileName',
  status: 'status',
  cursor: 'cursor',
  totalRows: 'totalRows',
  importedRows: 'importedRows',
  failedRows: 'failedRows',
  csvRaw: 'csvRaw',
  errors: 'errors',
  errorSummary: 'errorSummary',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceSegmentScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  audienceId: 'audienceId',
  name: 'name',
  definition: 'definition',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BlastScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  audienceId: 'audienceId',
  createdById: 'createdById',
  title: 'title',
  bodyTemplate: 'bodyTemplate',
  status: 'status',
  scheduledFor: 'scheduledFor',
  proofedAt: 'proofedAt',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BlastTemplateScalarFieldEnum = {
  id: 'id',
  blastId: 'blastId',
  version: 'version',
  body: 'body',
  createdAt: 'createdAt'
};

exports.Prisma.BlastRecipientScalarFieldEnum = {
  id: 'id',
  blastId: 'blastId',
  contactId: 'contactId',
  phoneE164: 'phoneE164',
  renderedBody: 'renderedBody',
  status: 'status',
  failureCategory: 'failureCategory',
  twilioMessageSid: 'twilioMessageSid',
  sentAt: 'sentAt',
  deliveredAt: 'deliveredAt',
  respondedAt: 'respondedAt',
  errorCode: 'errorCode',
  errorMessage: 'errorMessage',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InboundMessageScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  blastId: 'blastId',
  fromPhone: 'fromPhone',
  toPhone: 'toPhone',
  body: 'body',
  twilioMessageSid: 'twilioMessageSid',
  receivedAt: 'receivedAt',
  threadKey: 'threadKey',
  createdAt: 'createdAt'
};

exports.Prisma.OutboundMessageScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  blastId: 'blastId',
  recipientId: 'recipientId',
  toPhone: 'toPhone',
  fromPhone: 'fromPhone',
  body: 'body',
  status: 'status',
  twilioMessageSid: 'twilioMessageSid',
  sentAt: 'sentAt',
  errorCode: 'errorCode',
  errorMessage: 'errorMessage',
  createdAt: 'createdAt'
};

exports.Prisma.IntegrationConnectionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  type: 'type',
  name: 'name',
  status: 'status',
  encryptedCredential: 'encryptedCredential',
  settings: 'settings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IntegrationSyncJobScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  integrationConnectionId: 'integrationConnectionId',
  audienceId: 'audienceId',
  status: 'status',
  query: 'query',
  remoteListId: 'remoteListId',
  syncedCount: 'syncedCount',
  failedCount: 'failedCount',
  errorSummary: 'errorSummary',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt'
};

exports.Prisma.AnalyticsSnapshotScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  blastId: 'blastId',
  metricName: 'metricName',
  metricValue: 'metricValue',
  labels: 'labels',
  bucketAt: 'bucketAt',
  createdAt: 'createdAt'
};

exports.Prisma.ConversationStateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contactPhone: 'contactPhone',
  unreadCount: 'unreadCount',
  resolved: 'resolved',
  lastMessageAt: 'lastMessageAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.AudienceSource = exports.$Enums.AudienceSource = {
  MANUAL: 'MANUAL',
  CSV: 'CSV',
  ACTION_NETWORK: 'ACTION_NETWORK',
  INTERNAL: 'INTERNAL'
};

exports.AudienceStatus = exports.$Enums.AudienceStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
};

exports.AudienceImportStatus = exports.$Enums.AudienceImportStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
};

exports.BlastStatus = exports.$Enums.BlastStatus = {
  DRAFTED: 'DRAFTED',
  PROOFED: 'PROOFED',
  SCHEDULED: 'SCHEDULED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED'
};

exports.BlastRecipientStatus = exports.$Enums.BlastRecipientStatus = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  RESPONDED: 'RESPONDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
};

exports.IntegrationType = exports.$Enums.IntegrationType = {
  ACTION_NETWORK: 'ACTION_NETWORK',
  INTERNAL: 'INTERNAL'
};

exports.IntegrationConnectionStatus = exports.$Enums.IntegrationConnectionStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
};

exports.IntegrationJobStatus = exports.$Enums.IntegrationJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
};

exports.Prisma.ModelName = {
  Organization: 'Organization',
  AppUser: 'AppUser',
  Audience: 'Audience',
  AudienceContact: 'AudienceContact',
  AudienceImport: 'AudienceImport',
  AudienceSegment: 'AudienceSegment',
  Blast: 'Blast',
  BlastTemplate: 'BlastTemplate',
  BlastRecipient: 'BlastRecipient',
  InboundMessage: 'InboundMessage',
  OutboundMessage: 'OutboundMessage',
  IntegrationConnection: 'IntegrationConnection',
  IntegrationSyncJob: 'IntegrationSyncJob',
  AnalyticsSnapshot: 'AnalyticsSnapshot',
  ConversationState: 'ConversationState'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
