import { R2_WORKER_URL } from "./r2-config";

const R2_PUBLIC_URL = R2_WORKER_URL;

export async function uploadImageToR2(
    uri: string,
    pathPrefix: string = "uploads",
    customFilename?: string
): Promise<string> {
    try {
        const FileSystem = require('expo-file-system');
        const name = customFilename || `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
        const filename = `${pathPrefix}/${name}`;
        const uploadUrl = `${R2_PUBLIC_URL}/${filename}`;

        const result = await FileSystem.uploadAsync(uploadUrl, uri, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
                "Content-Type": "image/webp",
            }
        });

        if (result.status >= 200 && result.status < 300) {
            return uploadUrl;
        } else {
            throw new Error(`R2 Upload failed: ${result.status} ${result.body}`);
        }
    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw error;
    }
}

export async function deleteImageFromR2(filename: string): Promise<boolean> {
    try {
        const url = `${R2_PUBLIC_URL}/${filename}`;
        const response = await fetch(url, {
            method: "DELETE",
        });
        return response.ok;
    } catch (error) {
        console.error("R2 Delete Error:", error);
        return false;
    }
}
