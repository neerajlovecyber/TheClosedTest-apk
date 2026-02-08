import * as FileSystem from 'expo-file-system/legacy';

// R2 public URL base for serving files (via Cloudflare Worker)
import { R2_WORKER_URL } from "./r2-config";

const R2_PUBLIC_URL = R2_WORKER_URL;

/**
 * Uploads an image to R2 via the Cloudflare Worker.
 * @param uri Local URI of the image to upload
 * @param pathPrefix Optional prefix for the file path (e.g., "proofs", "icons")
 * @param customFilename Optional custom filename (e.g. "image.webp"). If not provided, a random one is generated.
 * @returns The public URL of the uploaded image
 */
export async function uploadImageToR2(
    uri: string,
    pathPrefix: string = "uploads",
    customFilename?: string
): Promise<string> {
    try {
        const name = customFilename || `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
        const filename = `${pathPrefix}/${name}`;
        const uploadUrl = `${R2_PUBLIC_URL}/${filename}`;

        console.log(`Uploading to R2: ${uploadUrl}`);

        const result = await FileSystem.uploadAsync(uploadUrl, uri, {
            httpMethod: 'PUT',
            uploadType: 0 as any, // 0 = BINARY_CONTENT
            headers: {
                "Content-Type": "image/webp",
            }
        });

        if (result.status >= 200 && result.status < 300) {
            const body = result.body || "";
            if (body.includes("<!DOCTYPE html>") || body.includes("Cloudflare Access")) {
                throw new Error("Upload blocked by Cloudflare Access. Please disable Access for this worker or allow public access.");
            }
            console.log(`R2 Success Response: ${body}`);
            return uploadUrl;
        } else {
            throw new Error(`R2 Upload failed: ${result.status} ${result.body}`);
        }

    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw error;
    }
}

/**
 * Deletes an image from R2.
 * @param filename key to delete (e.g. "app-icons/123.webp")
 */
export async function deleteImageFromR2(filename: string): Promise<boolean> {
    try {
        const url = `${R2_PUBLIC_URL}/${filename}`;
        console.log(`Deleting from R2: ${url}`);
        const response = await fetch(url, {
            method: "DELETE",
        });
        if (response.ok) {
            console.log("R2 Delete Success");
            return true;
        } else {
            const text = await response.text();
            console.error("R2 Delete Failed:", response.status, text);
            return false;
        }
    } catch (error) {
        console.error("R2 Delete Error:", error);
        return false;
    }
}
