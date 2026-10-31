// Scopio's persistent project, authentication, and email records.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', { id: text('id').primaryKey(), owner: text('owner').notNull(), data: text('data').notNull(), revision: integer('revision').notNull().default(1), updatedAt: text('updated_at').notNull() });
export const sessions = sqliteTable('sessions', {id:text('id').primaryKey(), userId:text('user_id').notNull(), email:text('email').notNull(), name:text('name').notNull(), expiresAt:integer('expires_at').notNull()});
export const oauthStates = sqliteTable('oauth_states', {id:text('id').primaryKey(), verifier:text('verifier').notNull(), nonce:text('nonce').notNull(), returnTo:text('return_to').notNull(), expiresAt:integer('expires_at').notNull()});
export const rateLimits = sqliteTable('rate_limits', {id:text('id').primaryKey(), hits:integer('hits').notNull().default(1), expiresAt:integer('expires_at').notNull()});
export const gmailConnections = sqliteTable('gmail_connections',{owner:text('owner').primaryKey(),email:text('email').notNull(),token:text('token').notNull(),status:text('status').notNull(),connectedAt:text('connected_at').notNull()});
export const emailDailyUsage = sqliteTable('email_daily_usage',{id:text('id').primaryKey(),hits:integer('hits').notNull()});
export const emailOutbox = sqliteTable('email_outbox', {
 provider:text('provider').notNull().default('resend'),reviewedAt:text('reviewed_at'),clientDecision:text('client_decision'),decidedAt:text('decided_at'),
 id:text('id').primaryKey(),owner:text('owner').notNull(),projectId:text('project_id'),changeId:text('change_id'),reviewToken:text('review_token'),kind:text('kind').notNull(),recipient:text('recipient').notNull(),subject:text('subject').notNull(),payload:text('payload').notNull(),status:text('status').notNull().default('Queued'),attempts:integer('attempts').notNull().default(0),firstAttempt:integer('first_attempt'),nextAttempt:integer('next_attempt').notNull(),leaseUntil:integer('lease_until').notNull().default(0),providerId:text('provider_id'),error:text('error'),createdAt:text('created_at').notNull(),sentAt:text('sent_at')
},table=>[index('email_outbox_provider_id').on(table.provider,table.providerId),index('email_outbox_due').on(table.status,table.nextAttempt),index('email_outbox_owner').on(table.owner,table.createdAt)]);

export const gmailInvites=sqliteTable('gmail_invites',{email:text('email').primaryKey(),active:integer('active').notNull().default(1),createdAt:text('created_at').notNull()});
export const emailDelivery=sqliteTable('email_delivery',{providerId:text('provider_id').primaryKey(),state:text('state').notNull(),priority:integer('priority').notNull(),eventAt:integer('event_at').notNull()});
export const emailWebhookEvents=sqliteTable('email_webhook_events',{id:text('id').primaryKey(),providerId:text('provider_id').notNull(),type:text('type').notNull(),receivedAt:integer('received_at').notNull()},t=>[index('email_webhook_received').on(t.receivedAt)]);
export const serviceState=sqliteTable('service_state',{id:text('id').primaryKey(),lastSuccess:integer('last_success'),lastFailure:integer('last_failure'),runningSince:integer('running_since')});
export const serviceEvents=sqliteTable('service_events',{id:text('id').primaryKey(),route:text('route').notNull(),status:integer('status').notNull(),createdAt:integer('created_at').notNull()},t=>[index('service_events_time').on(t.createdAt)]);
