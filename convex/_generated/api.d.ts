/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_auth from "../api/auth.js";
import type * as api_backfill from "../api/backfill.js";
import type * as api_goals from "../api/goals.js";
import type * as api_mailboxes from "../api/mailboxes.js";
import type * as api_messages from "../api/messages.js";
import type * as api_users from "../api/users.js";
import type * as api_workflows from "../api/workflows.js";
import type * as http from "../http.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_gmail from "../lib/gmail.js";
import type * as lib_log from "../lib/log.js";
import type * as lib_mail from "../lib/mail.js";
import type * as lib_markdown from "../lib/markdown.js";
import type * as lib_pipeline from "../lib/pipeline.js";
import type * as models_backfillRuns_run from "../models/backfillRuns/run.js";
import type * as models_goals_manage from "../models/goals/manage.js";
import type * as models_jevWorkflows_manage from "../models/jevWorkflows/manage.js";
import type * as models_mailboxes_domain from "../models/mailboxes/domain.js";
import type * as models_mailboxes_gmail_backfill from "../models/mailboxes/gmail/backfill.js";
import type * as models_mailboxes_gmail_connect from "../models/mailboxes/gmail/connect.js";
import type * as models_mailboxes_gmail_sync from "../models/mailboxes/gmail/sync.js";
import type * as models_mailboxes_gmail_writeBack from "../models/mailboxes/gmail/writeBack.js";
import type * as models_mailboxes_list from "../models/mailboxes/list.js";
import type * as models_mailboxes_utils from "../models/mailboxes/utils.js";
import type * as models_messages_ingest from "../models/messages/ingest.js";
import type * as models_messages_list from "../models/messages/list.js";
import type * as models_messages_read from "../models/messages/read.js";
import type * as models_messages_resort from "../models/messages/resort.js";
import type * as models_messages_send from "../models/messages/send.js";
import type * as models_messages_status from "../models/messages/status.js";
import type * as models_messages_triage from "../models/messages/triage.js";
import type * as models_messages_utils from "../models/messages/utils.js";
import type * as models_users_auth from "../models/users/auth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/auth": typeof api_auth;
  "api/backfill": typeof api_backfill;
  "api/goals": typeof api_goals;
  "api/mailboxes": typeof api_mailboxes;
  "api/messages": typeof api_messages;
  "api/users": typeof api_users;
  "api/workflows": typeof api_workflows;
  http: typeof http;
  "lib/crypto": typeof lib_crypto;
  "lib/functions": typeof lib_functions;
  "lib/gmail": typeof lib_gmail;
  "lib/log": typeof lib_log;
  "lib/mail": typeof lib_mail;
  "lib/markdown": typeof lib_markdown;
  "lib/pipeline": typeof lib_pipeline;
  "models/backfillRuns/run": typeof models_backfillRuns_run;
  "models/goals/manage": typeof models_goals_manage;
  "models/jevWorkflows/manage": typeof models_jevWorkflows_manage;
  "models/mailboxes/domain": typeof models_mailboxes_domain;
  "models/mailboxes/gmail/backfill": typeof models_mailboxes_gmail_backfill;
  "models/mailboxes/gmail/connect": typeof models_mailboxes_gmail_connect;
  "models/mailboxes/gmail/sync": typeof models_mailboxes_gmail_sync;
  "models/mailboxes/gmail/writeBack": typeof models_mailboxes_gmail_writeBack;
  "models/mailboxes/list": typeof models_mailboxes_list;
  "models/mailboxes/utils": typeof models_mailboxes_utils;
  "models/messages/ingest": typeof models_messages_ingest;
  "models/messages/list": typeof models_messages_list;
  "models/messages/read": typeof models_messages_read;
  "models/messages/resort": typeof models_messages_resort;
  "models/messages/send": typeof models_messages_send;
  "models/messages/status": typeof models_messages_status;
  "models/messages/triage": typeof models_messages_triage;
  "models/messages/utils": typeof models_messages_utils;
  "models/users/auth": typeof models_users_auth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  batchWorker: import("@convex-dev/batch-worker/_generated/component.js").ComponentApi<"batchWorker">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
};
