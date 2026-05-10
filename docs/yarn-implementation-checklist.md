# Yarns SMS Blast Implementation Checklist

## Milestone 1: Platform Foundation
- [ ] API bootstraps with NestJS and Prisma.
- [ ] Postgres schema covers audiences, blasts, recipients, messages, integrations, and analytics.
- [ ] Runtime env validation blocks startup on invalid critical settings.
- [ ] Shared API response and request ID middleware are active.

## Milestone 2: Audience + Integrations
- [ ] Audience CRUD endpoints support active/archived states.
- [ ] CSV upload imports contacts with row-level validation feedback.
- [ ] Action Network connector can validate credentials, search lists, preview list samples, and sync contacts.
- [ ] Internal source connector can validate/search/sample/sync using configured endpoint.

## Milestone 3: Blasts + Lifecycle
- [ ] Blasts support drafted/proofed/scheduled/sending/sent/failed lifecycle transitions.
- [ ] Handlebars proofing endpoint renders sample recipients.
- [ ] Compliance validation includes opt-out and quiet-hours checks.
- [ ] Send/dispatch writes per-recipient outcomes and failure categories.

## Milestone 4: Analytics + Realtime
- [ ] KPI summary endpoint returns sent/delivered/responded counts.
- [ ] Engagement-over-time endpoint returns bucketed trend data.
- [ ] Recipient activity endpoint supports filtering/pagination.
- [ ] SSE updates stream blast/inbox events in realtime.

## Milestone 5: Inbox + Two-Way Messaging
- [ ] Inbound webhook persists messages to conversation threads.
- [ ] Inbox list endpoint returns unread counts and latest context.
- [ ] Thread endpoint supports inline replies.
- [ ] AI suggestion endpoint returns optional reply suggestions.

## Milestone 6: Web Product Surfaces
- [ ] App shell includes persistent navigation for Dashboard, Audience, Analytics, Inbox, plus Create Blast CTA.
- [ ] Design system tokens and typography align with Yarns branding.
- [ ] Dashboard shows KPI cards and recent blasts.
- [ ] Audience page supports CSV upload, integration sync, segmented list UI.
- [ ] Blast composer route supports templating, personalization chips, preview, and send/proof actions.
- [ ] Analytics shows KPI cards, trend chart, and recipient activity list.
- [ ] Inbox supports search, contextual threading, and inline replies.

## Milestone 7: Hardening + Release
- [ ] Local and production compose docs include Postgres and migration flow.
- [ ] `.env.example` files include all new required variables.
- [ ] README reflects updated architecture and runbook.
- [ ] Launch checklist and rollback gates are documented.
