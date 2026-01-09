import { NextResponse } from "next/server";
import OSS from "ali-oss";
import qiniu from "qiniu";
import { v4 as uuidv4 } from "uuid";

// Check if all required environment variables are set
function getOSSConfig() {
  return {
    region: process.env.OSS_REGION || process.env.NEXT_PUBLIC_OSS_REGION,
    accessKeyId:
      process.env.OSS_ACCESS_KEY_ID || process.env.NEXT_PUBLIC_OSS_ACCESS_KEY_ID,
    accessKeySecret:
      process.env.OSS_ACCESS_KEY_SECRET ||
      process.env.NEXT_PUBLIC_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET || process.env.NEXT_PUBLIC_OSS_BUCKET,
  };
}

function getQiniuConfig() {
  return {
    accessKey: process.env.QINIU_ACCESS_KEY,
    secretKey: process.env.QINIU_SECRET_KEY,
    bucket: process.env.QINIU_BUCKET,
    domain: process.env.QINIU_DOMAIN,
  };
}

// Validate and create OSS client
function createOSSClient() {
  const config = getOSSConfig();

  // Validate environment variables
  const missingEnvVars = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Alibaba OSS not configured. Missing environment variables: ${missingEnvVars.join(", ")}.`
    );
  }

  return new OSS({
    region: config.region!,
    accessKeyId: config.accessKeyId!,
    accessKeySecret: config.accessKeySecret!,
    bucket: config.bucket!,
  });
}

// Create Qiniu upload token
function getQiniuToken() {
  const config = getQiniuConfig();
  if (!config.accessKey || !config.secretKey || !config.bucket) {
    throw new Error("Qiniu OSS not configured. Missing AccessKey, SecretKey or Bucket.");
  }
  const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({ scope: config.bucket });
  return putPolicy.uploadToken(mac);
}

// 获取存储策略
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'aliyun';

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 5000,
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadToAliyun(
  client: OSS,
  filename: string,
  buffer: Buffer,
  attempt: number = 1
): Promise<string> {
  const config = getOSSConfig();
  try {
    await client.put(filename, buffer);
    return `https://${config.bucket}.${config.region}.aliyuncs.com/${filename}`;
  } catch (err) {
    if (attempt >= RETRY_CONFIG.maxRetries) throw err;
    await delay(Math.min(RETRY_CONFIG.initialDelay * Math.pow(2, attempt - 1), RETRY_CONFIG.maxDelay));
    return uploadToAliyun(client, filename, buffer, attempt + 1);
  }
}

async function uploadToQiniu(
  filename: string,
  buffer: Buffer,
  attempt: number = 1
): Promise<string> {
  const config = getQiniuConfig();
  const token = getQiniuToken();
  const qiniuConfig = new qiniu.conf.Config();
  const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
  const putExtra = new qiniu.form_up.PutExtra();

  return new Promise((resolve, reject) => {
    formUploader.put(token, filename, buffer, putExtra, (respErr, respBody, respInfo) => {
      if (respErr) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          delay(Math.min(RETRY_CONFIG.initialDelay * Math.pow(2, attempt - 1), RETRY_CONFIG.maxDelay))
            .then(() => uploadToQiniu(filename, buffer, attempt + 1))
            .then(resolve)
            .catch(reject);
        } else {
          reject(respErr);
        }
        return;
      }
      if (respInfo.statusCode === 200) {
        // 构建七牛 URL
        const domain = config.domain?.replace(/\/$/, '');
        resolve(`${domain}/${filename}`);
      } else {
        reject(new Error(`Qiniu upload failed with status ${respInfo.statusCode}`));
      }
    });
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const directory = formData.get("directory") as string || "articles";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 检查文件类型
    const allowedTypes = ["text/markdown", "text/plain", "image/", "video/"];
    const isAllowedType = allowedTypes.some(type =>
      file.type.startsWith(type) || file.name.endsWith(".md")
    );

    if (!isAllowedType) {
      return NextResponse.json({ error: "Only markdown, image and video files are allowed" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension) {
      return NextResponse.json({ error: "Invalid file extension" }, { status: 400 });
    }

    let basePath = "articles";
    if (file.type.startsWith("image/")) {
      basePath = "images";
    } else if (file.type.startsWith("video/")) {
      basePath = "videos";
    }
    const filename = `${basePath}/${directory}/${uuidv4()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url = "";
    if (STORAGE_PROVIDER === 'qiniu') {
      url = await uploadToQiniu(filename, buffer);
    } else {
      const client = createOSSClient();
      url = await uploadToAliyun(client, filename, buffer);
    }

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}

