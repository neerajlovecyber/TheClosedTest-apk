import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { env } from "../env"

export interface PresignedUploadRequest {
  filename: string
  contentType: string
  folder?: "proofs" | "avatars" | "icons" | "messages" | "reports"
}

export interface PresignedUploadResponse {
  uploadUrl: string
  publicUrl: string
  key: string
}

let s3Client: S3Client | null = null

function getS3Client(): S3Client | null {
  if (
    !env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
    !env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    !env.CLOUDFLARE_R2_ACCOUNT_ID
  ) {
    return null
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
    })
  }

  return s3Client
}

export async function generateUploadUrl({
  filename,
  contentType,
  folder = "proofs",
}: PresignedUploadRequest): Promise<PresignedUploadResponse> {
  const extension = filename.split(".").pop() || "bin"
  const uniqueKey = `${folder}/${crypto.randomUUID()}.${extension}`

  const publicBaseUrl = env.CLOUDFLARE_R2_PUBLIC_URL || "https://assets.theclosedtest.com"
  const publicUrl = `${publicBaseUrl}/${uniqueKey}`
  const bucketName = env.CLOUDFLARE_R2_BUCKET_NAME || "theclosedtest"

  const client = getS3Client()

  if (client) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      ContentType: contentType,
    })

    // URL expires in 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 })

    return {
      uploadUrl,
      publicUrl,
      key: uniqueKey,
    }
  }

  // Fallback if R2 credentials are not set
  const uploadUrl = `${publicBaseUrl}/upload/${uniqueKey}`

  return {
    uploadUrl,
    publicUrl,
    key: uniqueKey,
  }
}
