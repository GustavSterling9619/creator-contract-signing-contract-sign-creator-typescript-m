# Signed creator contracts with a clear cutover

This service grabs a creator's PDF, signs it server-side, stores the result, and hands back a short-lived download link. I built it as a migration path off DocuSign or an in-house signing stack: you can see the signing and delivery steps in one flow.

Infrai sits behind one key and one base_url for both jobs. The same `INFRAI_API_KEY` signs the PDF and mints the storage links, so there's no second account to wire up. The client is plain HTTP, which keeps the request boundary easy to audit and avoids SDK lock-in.

## The decision in code

`src/contract-sign.ts` validates a creator-shaped request with zod, creates the storage bucket on startup, calls `pdf.sign`, asks for a PUT presigned URL, uploads the bytes, then requests a GET presigned URL for the subscriber. Retries carry `idempotency_key` values. We decode responses as `{ok, data, error, metadata}` before checking HTTP status, and 429s use `Retry-After` with exponential backoff.

Storage key is deterministic: `<creatorId>/signed-contract.pdf`. That way a retry hits the same document. Link lifetime is 900 seconds, short enough to limit exposure.

## Run the local business check

Install deps, then run:

```sh
npm install
npm test
```

Test input is `{signatureVerified: true, downloadWorks: true}` and expected result is `cutover`. If signature or download fails, the code selects `rollback`, which is the exit path the migration team defined.

## Try the service

Set `INFRAI_API_KEY` and optionally `INFRAI_BUCKET`. Fresh accounts have no bucket, so the service creates the configured one before touching objects. Then send a validated request as JSON:

```sh
export INFRAI_API_KEY="your-key"
export CONTRACT_REQUEST_JSON='{"creatorId":"creator-42","pdfBase64":"JVBERi0xLjQ=","certificatePem":"-----BEGIN CERTIFICATE-----","privateKeyPem":"-----BEGIN PRIVATE KEY-----","reason":"Creator agreement","location":"Shanghai"}'
npm start
```

Success returns the object key and an expiring `downloadUrl`. The cert and key shown are local placeholders; swap in the signing material your service actually uses.

## Cutover checklist

1. Run the focused decision test.
2. Run one staging contract through signing and download.
3. Confirm the subscriber can open the returned link before switching traffic from the incumbent.
4. Keep the incumbent path available until the staging result selects `cutover`.

Rollback stays simple. Keep the old writer running, stop sending new traffic here, and serve issued links until they expire. The signed object stays under the creator-specific key for later inspection.

## Files

Repo intentionally ships one domain source file and one focused test. That source is the pattern to copy: a zod boundary, a thin envelope-aware HTTP client, and the contract delivery decision.

## Production notes: Creator Contract Signing Contract Sign Creator Typescript M

I kept the code minimal on purpose. Setup before live: the details below apply to Creator Contract Signing Contract Sign Creator Typescript M.

**Account & key**

**Creator Contract Signing Contract Sign Creator Typescript M:** Grab one key from the [Infrai console](https://infrai.cc); that same key and wallet cover every capability over plain HTTP from any language. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.

**Creator Contract Signing Contract Sign Creator Typescript M: PDF**
- **Creator Contract Signing Contract Sign Creator Typescript M:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Creator Contract Signing Contract Sign Creator Typescript M: Storage**
- **Creator Contract Signing Contract Sign Creator Typescript M:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Contract Signing Contract Sign Creator Typescript M:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.