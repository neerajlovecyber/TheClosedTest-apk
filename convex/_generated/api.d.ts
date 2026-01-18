/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminChats from "../adminChats.js";
import type * as apps from "../apps.js";
import type * as boost from "../boost.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as matches from "../matches.js";
import type * as moderation from "../moderation.js";
import type * as notificationHelper from "../notificationHelper.js";
import type * as notifications from "../notifications.js";
import type * as reports from "../reports.js";
import type * as tickets from "../tickets.js";
import type * as triggers from "../triggers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminChats: typeof adminChats;
  apps: typeof apps;
  boost: typeof boost;
  crons: typeof crons;
  files: typeof files;
  http: typeof http;
  matches: typeof matches;
  moderation: typeof moderation;
  notificationHelper: typeof notificationHelper;
  notifications: typeof notifications;
  reports: typeof reports;
  tickets: typeof tickets;
  triggers: typeof triggers;
  users: typeof users;
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

export declare const components: {};
