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

export async function generateUploadUrl({
  filename,
  contentType,
  folder = "proofs",
}: PresignedUploadRequest): Promise<PresignedUploadResponse> {
  const extension = filename.split(".").pop() || "bin"
  const uniqueKey = `${folder}/${crypto.randomUUID()}.${extension}`

  const publicBaseUrl = env.CLOUDFLARE_R2_PUBLIC_URL || "https://assets.theclosedtest.com"
  const publicUrl = `${publicBaseUrl}/${uniqueKey}`

  // For development or Cloudflare R2 integration:
  const uploadUrl = `${publicBaseUrl}/upload/${uniqueKey}`

  return {
    uploadUrl,
    publicUrl,
    key: uniqueKey,
  }
}
