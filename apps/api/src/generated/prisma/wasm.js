
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

exports.Prisma.ContactScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  phoneE164: 'phoneE164',
  addressNorm: 'addressNorm',
  gnafPid: 'gnafPid',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  address: 'address',
  lat: 'lat',
  lng: 'lng',
  turfId: 'turfId',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AppUserScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  email: 'email',
  displayName: 'displayName',
  passwordHash: 'passwordHash',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  createdById: 'createdById',
  name: 'name',
  source: 'source',
  channel: 'channel',
  kind: 'kind',
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
  contactId: 'contactId',
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
  channel: 'channel',
  contentSid: 'contentSid',
  contentVariableMap: 'contentVariableMap',
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
  channel: 'channel',
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
  contactId: 'contactId',
  channel: 'channel',
  fromPhone: 'fromPhone',
  toPhone: 'toPhone',
  body: 'body',
  mediaUrl: 'mediaUrl',
  mediaContentType: 'mediaContentType',
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
  contactId: 'contactId',
  channel: 'channel',
  toPhone: 'toPhone',
  fromPhone: 'fromPhone',
  body: 'body',
  mediaUrl: 'mediaUrl',
  mediaContentType: 'mediaContentType',
  status: 'status',
  twilioMessageSid: 'twilioMessageSid',
  sentAt: 'sentAt',
  errorCode: 'errorCode',
  errorMessage: 'errorMessage',
  createdAt: 'createdAt'
};

exports.Prisma.ContactConsentScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contactId: 'contactId',
  phoneE164: 'phoneE164',
  channel: 'channel',
  state: 'state',
  source: 'source',
  updatedAt: 'updatedAt',
  createdAt: 'createdAt'
};

exports.Prisma.WhatsappTemplateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contentSid: 'contentSid',
  friendlyName: 'friendlyName',
  category: 'category',
  language: 'language',
  status: 'status',
  variables: 'variables',
  bodyPreview: 'bodyPreview',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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
  contactId: 'contactId',
  contactPhone: 'contactPhone',
  channel: 'channel',
  unreadCount: 'unreadCount',
  resolved: 'resolved',
  ownerId: 'ownerId',
  claimedAt: 'claimedAt',
  lastMessageAt: 'lastMessageAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScriptScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  channel: 'channel',
  campaignId: 'campaignId',
  isArchived: 'isArchived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScriptStepScalarFieldEnum = {
  id: 'id',
  scriptId: 'scriptId',
  parentStepId: 'parentStepId',
  outcomeKey: 'outcomeKey',
  bodyText: 'bodyText',
  orderIndex: 'orderIndex'
};

exports.Prisma.SurveyScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  campaignId: 'campaignId',
  isArchived: 'isArchived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.QuestionScalarFieldEnum = {
  id: 'id',
  surveyId: 'surveyId',
  prompt: 'prompt',
  type: 'type',
  orderIndex: 'orderIndex',
  required: 'required',
  scaleMin: 'scaleMin',
  scaleMax: 'scaleMax'
};

exports.Prisma.QuestionOptionScalarFieldEnum = {
  id: 'id',
  questionId: 'questionId',
  value: 'value',
  label: 'label',
  orderIndex: 'orderIndex',
  dispositionCode: 'dispositionCode',
  supportLevel: 'supportLevel',
  cannedReplyText: 'cannedReplyText'
};

exports.Prisma.QuestionResponseScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contactId: 'contactId',
  questionId: 'questionId',
  optionId: 'optionId',
  valueText: 'valueText',
  channel: 'channel',
  campaignId: 'campaignId',
  blastId: 'blastId',
  recordedById: 'recordedById',
  createdAt: 'createdAt'
};

exports.Prisma.DispositionDefScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  code: 'code',
  label: 'label',
  layer: 'layer',
  channel: 'channel',
  isTerminal: 'isTerminal',
  isLocked: 'isLocked',
  orderIndex: 'orderIndex'
};

exports.Prisma.DispositionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contactId: 'contactId',
  code: 'code',
  layer: 'layer',
  channel: 'channel',
  campaignId: 'campaignId',
  blastId: 'blastId',
  scriptStepId: 'scriptStepId',
  cannedResponseId: 'cannedResponseId',
  supportLevel: 'supportLevel',
  recordedById: 'recordedById',
  createdAt: 'createdAt'
};

exports.Prisma.CannedResponseScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  ownerId: 'ownerId',
  title: 'title',
  body: 'body',
  channel: 'channel',
  visibility: 'visibility',
  dispositionCode: 'dispositionCode',
  surveyOptionId: 'surveyOptionId',
  isArchived: 'isArchived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JourneyScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  status: 'status',
  triggerType: 'triggerType',
  triggerConfig: 'triggerConfig',
  reentryCooldownMinutes: 'reentryCooldownMinutes',
  maxActivePerContact: 'maxActivePerContact',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JourneyRungScalarFieldEnum = {
  id: 'id',
  journeyId: 'journeyId',
  rungIndex: 'rungIndex',
  type: 'type',
  config: 'config'
};

exports.Prisma.JourneyEnrolmentScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  journeyId: 'journeyId',
  contactId: 'contactId',
  currentRungIndex: 'currentRungIndex',
  state: 'state',
  context: 'context',
  resumeAt: 'resumeAt',
  lastRungAt: 'lastRungAt',
  rungExecCount: 'rungExecCount',
  enrolledAt: 'enrolledAt',
  completedAt: 'completedAt'
};

exports.Prisma.CanvassCampaignScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  status: 'status',
  surveyId: 'surveyId',
  scriptId: 'scriptId',
  goals: 'goals',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TurfScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  campaignId: 'campaignId',
  name: 'name',
  geometry: 'geometry',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TurfAssignmentScalarFieldEnum = {
  id: 'id',
  turfId: 'turfId',
  canvasserId: 'canvasserId',
  status: 'status',
  lockedUntil: 'lockedUntil',
  assignedAt: 'assignedAt',
  releasedAt: 'releasedAt'
};

exports.Prisma.WalkListScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  campaignId: 'campaignId',
  turfId: 'turfId',
  name: 'name',
  listType: 'listType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WalkListItemScalarFieldEnum = {
  id: 'id',
  walkListId: 'walkListId',
  contactId: 'contactId',
  orderIndex: 'orderIndex',
  status: 'status'
};

exports.Prisma.DoorKnockScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  contactId: 'contactId',
  canvasserId: 'canvasserId',
  walkListItemId: 'walkListItemId',
  localId: 'localId',
  dispositionCode: 'dispositionCode',
  lat: 'lat',
  lng: 'lng',
  notes: 'notes',
  photoUrl: 'photoUrl',
  safetyFlag: 'safetyFlag',
  clientCapturedAt: 'clientCapturedAt',
  createdAt: 'createdAt'
};

exports.Prisma.ShiftScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  campaignId: 'campaignId',
  turfId: 'turfId',
  canvasserId: 'canvasserId',
  name: 'name',
  location: 'location',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SuppressionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  phoneE164: 'phoneE164',
  email: 'email',
  reason: 'reason',
  source: 'source',
  createdAt: 'createdAt'
};

exports.Prisma.PushSubscriptionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  userId: 'userId',
  endpoint: 'endpoint',
  p256dh: 'p256dh',
  auth: 'auth',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
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

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.AppUserRole = exports.$Enums.AppUserRole = {
  ORGANISER: 'ORGANISER',
  CANVASSER: 'CANVASSER'
};

exports.AudienceSource = exports.$Enums.AudienceSource = {
  MANUAL: 'MANUAL',
  CSV: 'CSV',
  ACTION_NETWORK: 'ACTION_NETWORK',
  INTERNAL: 'INTERNAL'
};

exports.AudienceChannel = exports.$Enums.AudienceChannel = {
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  ALL: 'ALL'
};

exports.AudienceKind = exports.$Enums.AudienceKind = {
  STATIC: 'STATIC',
  WHATSAPP_OPTED_IN: 'WHATSAPP_OPTED_IN'
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

exports.MessageChannel = exports.$Enums.MessageChannel = {
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP'
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
  READ: 'READ',
  RESPONDED: 'RESPONDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
};

exports.ConsentState = exports.$Enums.ConsentState = {
  UNKNOWN: 'UNKNOWN',
  OPTED_IN: 'OPTED_IN',
  OPTED_OUT: 'OPTED_OUT'
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

exports.EngagementChannel = exports.$Enums.EngagementChannel = {
  DOOR: 'DOOR',
  SMS: 'SMS',
  BOTH: 'BOTH'
};

exports.QuestionType = exports.$Enums.QuestionType = {
  yes_no: 'yes_no',
  single_choice: 'single_choice',
  multi_choice: 'multi_choice',
  text: 'text',
  scale: 'scale'
};

exports.SupportLevel = exports.$Enums.SupportLevel = {
  STRONG_SUPPORT: 'STRONG_SUPPORT',
  LEAN_SUPPORT: 'LEAN_SUPPORT',
  UNDECIDED: 'UNDECIDED',
  LEAN_OPPOSE: 'LEAN_OPPOSE',
  STRONG_OPPOSE: 'STRONG_OPPOSE'
};

exports.DispositionLayer = exports.$Enums.DispositionLayer = {
  CONTACT_RESULT: 'CONTACT_RESULT',
  TERMINAL: 'TERMINAL',
  DATA_QUALITY: 'DATA_QUALITY'
};

exports.CannedVisibility = exports.$Enums.CannedVisibility = {
  ORG: 'ORG',
  PERSONAL: 'PERSONAL',
  AUTO_SEND: 'AUTO_SEND'
};

exports.JourneyStatus = exports.$Enums.JourneyStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED'
};

exports.JourneyTriggerType = exports.$Enums.JourneyTriggerType = {
  disposition_set: 'disposition_set',
  message_received: 'message_received',
  tag_added: 'tag_added',
  survey_answer: 'survey_answer',
  no_answer_after: 'no_answer_after'
};

exports.JourneyRungType = exports.$Enums.JourneyRungType = {
  wait: 'wait',
  condition: 'condition',
  action: 'action'
};

exports.JourneyEnrolmentState = exports.$Enums.JourneyEnrolmentState = {
  ACTIVE: 'ACTIVE',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  EXITED: 'EXITED',
  FAILED: 'FAILED'
};

exports.CanvassCampaignStatus = exports.$Enums.CanvassCampaignStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
};

exports.TurfAssignmentStatus = exports.$Enums.TurfAssignmentStatus = {
  ASSIGNED: 'ASSIGNED',
  RELEASED: 'RELEASED'
};

exports.WalkListItemListType = exports.$Enums.WalkListItemListType = {
  STATIC: 'STATIC',
  DYNAMIC: 'DYNAMIC'
};

exports.WalkListItemStatus = exports.$Enums.WalkListItemStatus = {
  PENDING: 'PENDING',
  VISITED: 'VISITED',
  SKIPPED: 'SKIPPED'
};

exports.Prisma.ModelName = {
  Organization: 'Organization',
  Contact: 'Contact',
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
  ContactConsent: 'ContactConsent',
  WhatsappTemplate: 'WhatsappTemplate',
  IntegrationConnection: 'IntegrationConnection',
  IntegrationSyncJob: 'IntegrationSyncJob',
  AnalyticsSnapshot: 'AnalyticsSnapshot',
  ConversationState: 'ConversationState',
  Script: 'Script',
  ScriptStep: 'ScriptStep',
  Survey: 'Survey',
  Question: 'Question',
  QuestionOption: 'QuestionOption',
  QuestionResponse: 'QuestionResponse',
  DispositionDef: 'DispositionDef',
  Disposition: 'Disposition',
  CannedResponse: 'CannedResponse',
  Journey: 'Journey',
  JourneyRung: 'JourneyRung',
  JourneyEnrolment: 'JourneyEnrolment',
  CanvassCampaign: 'CanvassCampaign',
  Turf: 'Turf',
  TurfAssignment: 'TurfAssignment',
  WalkList: 'WalkList',
  WalkListItem: 'WalkListItem',
  DoorKnock: 'DoorKnock',
  Shift: 'Shift',
  Suppression: 'Suppression',
  PushSubscription: 'PushSubscription'
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
