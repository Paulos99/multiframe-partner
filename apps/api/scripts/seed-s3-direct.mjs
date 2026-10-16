/**
 * Write demo platform + analytics straight to Object Storage (bypasses flaky API TLS).
 * Loads credentials from ~/.yc/partner-storage.json or env.
 *
 * Usage: node apps/api/scripts/seed-s3-direct.mjs
 * After write, warm Cloud Function instances may still serve old memory —
 * call POST /admin/demo/reset or redeploy: python infra/mf_doh_patch_deploy.py
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildDemoPlatform, buildDemoAnalyticsEvents } from '../demoSeed.js';

function loadCreds() {
  const path = join(homedir(), '.yc', 'partner-storage.json');
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return {
      bucket: process.env.PARTNERS_BUCKET || j.PARTNERS_BUCKET,
      accessKeyId: process.env.YC_ACCESS_KEY_ID || j.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY || j.YC_SECRET_ACCESS_KEY,
      region: process.env.YC_REGION || j.YC_REGION || 'ru-central1',
    };
  } catch {
    return {
      bucket: process.env.PARTNERS_BUCKET,
      accessKeyId: process.env.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY,
      region: process.env.YC_REGION || 'ru-central1',
    };
  }
}

async function main() {
  const creds = loadCreds();
  if (!creds.bucket || !creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error('Missing S3 credentials (partner-storage.json or env)');
  }
  const client = new S3Client({
    region: creds.region,
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  const platform = buildDemoPlatform();
  const events = buildDemoAnalyticsEvents();
  const platformKey = process.env.PLATFORM_KEY || 'platform-v2.json';
  const eventsKey = process.env.ANALYTICS_KEY || 'analytics-events.json';

  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: platformKey,
      Body: JSON.stringify(platform, null, 2),
      ContentType: 'application/json',
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: eventsKey,
      Body: JSON.stringify(events),
      ContentType: 'application/json',
    }),
  );

  // read-back
  const got = await client.send(new GetObjectCommand({ Bucket: creds.bucket, Key: platformKey }));
  const body = JSON.parse(await got.Body.transformToString());
  console.log(
    JSON.stringify({
      ok: true,
      bucket: creds.bucket,
      orgs: body.orgs?.length,
      users: body.users?.length,
      objects: body.objects?.length,
      events: events.length,
      companies: (body.orgs || []).map((o) => o.settings?.companyName),
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
