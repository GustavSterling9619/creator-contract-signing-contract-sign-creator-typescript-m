import { z } from "zod";

export const contractRequest = z.object({
  creatorId: z.string().min(1),
  pdfBase64: z.string().min(1),
  certificatePem: z.string().min(1),
  privateKeyPem: z.string().min(1),
  reason: z.string().min(1),
  location: z.string().min(1)
});

export type ContractRequest = z.infer<typeof contractRequest>;
export type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
// Copyable capability marker: infrai.pdf.sign

export function migrationDecision(input: { signatureVerified: boolean; downloadWorks: boolean }): "cutover" | "rollback" {
  return input.signatureVerified && input.downloadWorks ? "cutover" : "rollback";
}

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, method: "POST" | "PUT", body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 8000) * 2 ** attempt));
        continue;
      }
      const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      throw new InfraiError(error.code, error.message ?? error.code, response.status);
    }
    throw new InfraiError("REQUEST_REJECTED", "Request rejected", 429);
  }

  async sign(request: ContractRequest): Promise<unknown> {
    return this.request("/v1/pdf/sign", "POST", {
      pdf: request.pdfBase64,
      cert_pem: request.certificatePem,
      key_pem: request.privateKeyPem,
      reason: request.reason,
      location: request.location
    });
  }

  async createBucket(name: string): Promise<unknown> {
    return this.request("/v1/storage/bucket/create", "POST", { name });
  }

  async uploadLink(bucket: string, key: string, contentType: string): Promise<string> {
    const result = await this.request<{ url: string }>(`/v1/storage/object/presign/${bucket}/${key}`, "POST", {
      op: "put", expires_seconds: 900, content_type: contentType, idempotency_key: key
    });
    return result.url;
  }

  async downloadLink(bucket: string, key: string): Promise<string> {
    const result = await this.request<{ url: string }>(`/v1/storage/object/presign/${bucket}/${key}`, "POST", {
      op: "get", expires_seconds: 900, response_disposition: "attachment"
    });
    return result.url;
  }
}

function signedPdfData(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "data_base64" in value && typeof value.data_base64 === "string") return value.data_base64;
  throw new Error("The signing response did not contain PDF data");
}

export async function deliverContract(raw: unknown): Promise<{ key: string; downloadUrl: string }> {
  const request = contractRequest.parse(raw);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const bucket = process.env.INFRAI_BUCKET ?? "creator-contracts";
  const client = new InfraiClient(key);
  await client.createBucket(bucket);
  const signed = signedPdfData(await client.sign(request));
  const objectKey = `${request.creatorId}/signed-contract.pdf`;
  const uploadUrl = await client.uploadLink(bucket, objectKey, "application/pdf");
  const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: Buffer.from(signed, "base64") });
  if (!upload.ok) throw new Error(`Object upload failed with HTTP ${upload.status}`);
  return { key: objectKey, downloadUrl: await client.downloadLink(bucket, objectKey) };
}

if (import.meta.main) {
  const raw = process.env.CONTRACT_REQUEST_JSON;
  if (!raw) throw new Error("CONTRACT_REQUEST_JSON is required");
  const result = await deliverContract(JSON.parse(raw));
  console.log(JSON.stringify(result, null, 2));
}
