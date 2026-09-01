import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { generateUploadUrl, type PresignedUploadRequest } from "../services/r2-storage"

export class StorageController {
  static async getPresignedUrl(c: Context) {
    const body = c.req.valid("json" as never) as PresignedUploadRequest
    const result = await generateUploadUrl(body)
    return c.json(result, HttpStatusCodes.OK)
  }
}
