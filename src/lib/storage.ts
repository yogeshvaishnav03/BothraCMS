import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface StorageMetadata {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  provider: "LOCAL" | "S3" | "R2";
  url?: string;
}

export interface IStorageProvider {
  name: "LOCAL" | "S3" | "R2";
  put(key: string, buffer: Buffer, mimeType: string): Promise<{ key: string; url?: string }>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  getSignedDownloadUrl(key: string, originalName?: string, expiresInSeconds?: number): Promise<string>;
}

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), "storage", "uploads", "private");

/**
 * Local Disk Provider
 */
export class LocalStorageProvider implements IStorageProvider {
  name: "LOCAL" = "LOCAL";

  constructor() {
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
  }

  async put(key: string, buffer: Buffer): Promise<{ key: string; url?: string }> {
    const safeKey = path.basename(key);
    const dest = path.join(LOCAL_STORAGE_DIR, safeKey);
    await fs.promises.writeFile(dest, buffer);
    return { key: safeKey, url: `/api/uploads/${safeKey}` };
  }

  async get(key: string): Promise<Buffer | null> {
    const safeKey = path.basename(key);
    const target = path.join(LOCAL_STORAGE_DIR, safeKey);
    if (!fs.existsSync(target)) return null;
    return await fs.promises.readFile(target);
  }

  async delete(key: string): Promise<boolean> {
    const safeKey = path.basename(key);
    const target = path.join(LOCAL_STORAGE_DIR, safeKey);
    if (fs.existsSync(target)) {
      await fs.promises.unlink(target);
      return true;
    }
    return false;
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const safeKey = path.basename(key);
    return `/api/uploads/${safeKey}`;
  }
}

/**
 * S3 / Cloudflare R2 Compatible Storage Provider
 * Implements S3 REST API v4 signing without external SDK bloat
 */
export class S3CompatibleStorageProvider implements IStorageProvider {
  name: "S3" | "R2";
  private endpoint: string;
  private bucket: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;

  constructor(config: {
    endpoint?: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
    providerName?: "S3" | "R2";
  }) {
    this.name = config.providerName || (config.endpoint?.includes("r2.cloudflarestorage.com") ? "R2" : "S3");
    this.bucket = config.bucket;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region || "auto";
    this.endpoint = config.endpoint
      ? config.endpoint.replace(/\/$/, "")
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  private getUrl(key: string): string {
    const safeKey = encodeURIComponent(path.basename(key));
    if (this.endpoint.includes(this.bucket)) {
      return `${this.endpoint}/${safeKey}`;
    }
    return `${this.endpoint}/${this.bucket}/${safeKey}`;
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<{ key: string; url?: string }> {
    const url = this.getUrl(key);
    const dateStr = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateOnly = dateStr.slice(0, 8);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": buffer.length.toString(),
      "x-amz-date": dateStr,
      "x-amz-content-sha256": crypto.createHash("sha256").update(buffer).digest("hex"),
    };

    // AWS Signature v4
    const authHeader = this.signRequest("PUT", url, headers, headers["x-amz-content-sha256"], dateOnly, dateStr);
    headers["Authorization"] = authHeader;

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`S3 PutObject failed (${res.status}): ${errText}`);
    }

    return { key, url };
  }

  async get(key: string): Promise<Buffer | null> {
    const url = this.getUrl(key);
    const dateStr = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateOnly = dateStr.slice(0, 8);
    const emptySha = crypto.createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      "x-amz-date": dateStr,
      "x-amz-content-sha256": emptySha,
    };

    const authHeader = this.signRequest("GET", url, headers, emptySha, dateOnly, dateStr);
    headers["Authorization"] = authHeader;

    const res = await fetch(url, { method: "GET", headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 GetObject failed with status ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<boolean> {
    const url = this.getUrl(key);
    const dateStr = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateOnly = dateStr.slice(0, 8);
    const emptySha = crypto.createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      "x-amz-date": dateStr,
      "x-amz-content-sha256": emptySha,
    };

    const authHeader = this.signRequest("DELETE", url, headers, emptySha, dateOnly, dateStr);
    headers["Authorization"] = authHeader;

    const res = await fetch(url, { method: "DELETE", headers });
    return res.ok || res.status === 404;
  }

  async getSignedDownloadUrl(key: string, originalName?: string, expiresInSeconds = 3600): Promise<string> {
    const rawUrl = new URL(this.getUrl(key));
    const dateStr = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateOnly = dateStr.slice(0, 8);

    const credential = `${this.accessKeyId}/${dateOnly}/${this.region}/s3/aws4_request`;

    rawUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    rawUrl.searchParams.set("X-Amz-Credential", credential);
    rawUrl.searchParams.set("X-Amz-Date", dateStr);
    rawUrl.searchParams.set("X-Amz-Expires", expiresInSeconds.toString());
    rawUrl.searchParams.set("X-Amz-SignedHeaders", "host");

    if (originalName) {
      rawUrl.searchParams.set(
        "response-content-disposition",
        `inline; filename="${encodeURIComponent(originalName)}"`
      );
    }

    const canonicalQueryString = Array.from(rawUrl.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const canonicalRequest = [
      "GET",
      rawUrl.pathname,
      canonicalQueryString,
      `host:${rawUrl.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      dateStr,
      `${dateOnly}/${this.region}/s3/aws4_request`,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateOnly, this.region, "s3");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    rawUrl.searchParams.set("X-Amz-Signature", signature);
    return rawUrl.toString();
  }

  private signRequest(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    payloadHash: string,
    dateOnly: string,
    dateStr: string
  ): string {
    const url = new URL(urlStr);
    const signedHeaders = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();

    const canonicalHeaders = signedHeaders
      .map((k) => `${k}:${headers[k].trim()}\n`)
      .join("");

    const canonicalRequest = [
      method,
      url.pathname,
      url.search.slice(1),
      canonicalHeaders,
      signedHeaders.join(";"),
      payloadHash,
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      dateStr,
      `${dateOnly}/${this.region}/s3/aws4_request`,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateOnly, this.region, "s3");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${dateOnly}/${this.region}/s3/aws4_request, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac("sha256", "AWS4" + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
    const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
    return crypto.createHmac("sha256", kService).update("aws4_request").digest();
  }
}

/**
 * Storage Provider Factory
 */
export function getStorageProvider(): IStorageProvider {
  const s3Bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.R2_BUCKET;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;

  if (s3Bucket && accessKey && secretKey) {
    const endpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
    const region = process.env.AWS_REGION || process.env.S3_REGION || "auto";
    return new S3CompatibleStorageProvider({
      bucket: s3Bucket,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      endpoint,
      region,
      providerName: endpoint?.includes("r2.cloudflarestorage.com") ? "R2" : "S3",
    });
  }

  return new LocalStorageProvider();
}
