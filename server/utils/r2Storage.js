import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Upload buffer to R2
 * @param {Buffer} buffer - File buffer
 * @param {string} key - File path in bucket (e.g., "playlists/abc123_large.jpg")
 * @param {string} contentType - MIME type
 * @returns {string} Public URL
 */
export async function uploadToR2(buffer, key, contentType) {
  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      // Note: Bucket-level CORS must be configured in Cloudflare R2 dashboard:
      // Settings -> CORS Policy -> Add rule with:
      // - AllowedOrigins: ["*"]
      // - AllowedMethods: ["GET", "HEAD"]
      // - AllowedHeaders: ["*"]
    }));

    // Return public URL
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error('R2 upload error:', error);
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
}

/**
 * Delete file from R2
 * @param {string} key - File path in bucket
 */
export async function deleteFromR2(key) {
  try {
    await r2Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch (error) {
    console.error('R2 delete error:', error);
    return false;
  }
}

/**
 * Delete multiple files from R2
 * @param {string[]} keys - Array of file paths
 */
export async function deleteMultipleFromR2(keys) {
  const results = {
    success: true,
    deletedFiles: [],
    errors: [],
  };

  for (const key of keys) {
    try {
      await deleteFromR2(key);
      results.deletedFiles.push(key);
    } catch (error) {
      results.errors.push(`Failed to delete ${key}: ${error.message}`);
      results.success = false;
    }
  }

  return results;
}

/**
 * Check if file exists in R2
 * @param {string} key - File path in bucket
 */
export async function fileExistsInR2(key) {
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extract R2 key from URL or path
 * Handles both R2 URLs and legacy /uploads/ paths
 * @param {string} url - Image URL
 * @returns {string|null} - R2 key or null
 */
export function extractR2Key(url) {
  if (!url || typeof url !== 'string') return null;

  // If R2 URL (.r2.cloudflarestorage.com or .r2.dev), extract key
  if (url.includes('.r2.cloudflarestorage.com/')) {
    const parts = url.split('.r2.cloudflarestorage.com/');
    return parts[1] || null;
  }

  if (url.includes('.r2.dev/')) {
    const parts = url.split('.r2.dev/');
    return parts[1] || null;
  }

  // If custom domain (matches R2_PUBLIC_URL), extract key
  if (process.env.R2_PUBLIC_URL && url.startsWith(process.env.R2_PUBLIC_URL + '/')) {
    return url.replace(process.env.R2_PUBLIC_URL + '/', '');
  }

  // If legacy /uploads/ path, convert to R2 key
  if (url.startsWith('/uploads/')) {
    return url.replace(/^\/uploads\//, '');
  }

  return null;
}

/**
 * List all objects in R2 bucket
 * @param {string} prefix - Optional prefix to filter objects (e.g., "playlists/")
 * @param {number} maxKeys - Maximum number of keys to return per request (default 1000)
 * @returns {Promise<Array<string>>} Array of R2 keys
 */
export async function listR2Objects(prefix = '', maxKeys = 1000) {
  const allKeys = [];
  let continuationToken = null;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      });

      const response = await r2Client.send(command);

      if (response.Contents) {
        response.Contents.forEach(object => {
          if (object.Key) {
            allKeys.push(object.Key);
          }
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
    } while (continuationToken);

    return allKeys;
  } catch (error) {
    console.error('R2 list objects error:', error);
    throw new Error(`Failed to list R2 objects: ${error.message}`);
  }
}

/**
 * Batch delete files from R2 (up to 1000 at a time)
 * More efficient than individual deletions for large batches
 * @param {string[]} keys - Array of file paths (max 1000 per batch)
 * @returns {Promise<Object>} Deletion results
 */
export async function batchDeleteFromR2(keys) {
  if (!keys || keys.length === 0) {
    return { deletedCount: 0, errors: [] };
  }

  const results = {
    deletedCount: 0,
    errors: []
  };

  // Split into batches of 1000 (S3 API limit)
  const batchSize = 1000;
  const batches = [];

  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }

  // Process each batch
  for (const batch of batches) {
    try {
      const deleteParams = {
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
          Quiet: false
        }
      };

      const response = await r2Client.send(new DeleteObjectsCommand(deleteParams));

      // Count successful deletions
      if (response.Deleted) {
        results.deletedCount += response.Deleted.length;
      }

      // Track errors
      if (response.Errors) {
        response.Errors.forEach(error => {
          results.errors.push(`${error.Key}: ${error.Message}`);
        });
      }
    } catch (error) {
      results.errors.push(`Batch deletion failed: ${error.message}`);
    }
  }

  return results;
}
