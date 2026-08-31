import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

export const uploadFile = async ({ key, body, contentType }) => {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  // R2 buckets need a public access setting or custom domain configured
  // separately in the Cloudflare dashboard for this URL to resolve publicly
  return `${process.env.R2_PUBLIC_URL}/${key}`;
};

export const deleteFile = async (key) => {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

export const getFile = async (key) => {
  return r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
};