import { MongoClient, Db, MongoClientOptions } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("Please add your MongoDB URI to .env.local");
}

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/nextjs-blog";

// 优化的连接选项
const options: MongoClientOptions = {
  // 连接池配置
  maxPoolSize: 10, // 最大连接数
  minPoolSize: 2,  // 最小连接数（保持活跃连接）

  // 超时配置
  serverSelectionTimeoutMS: 5000, // 服务器选择超时（5秒）
  socketTimeoutMS: 45000,         // Socket 超时（45秒）
  connectTimeoutMS: 10000,        // 连接超时（10秒）

  // 重试配置
  retryWrites: true,
  retryReads: true,

  // 其他优化
  maxIdleTimeMS: 60000, // 连接最大空闲时间（60秒）
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    console.log('🔄 [MongoDB] 正在建立新的数据库连接...');
    const startTime = Date.now();
    globalWithMongo._mongoClientPromise = client.connect().then((client) => {
      const duration = Date.now() - startTime;
      console.log(`✅ [MongoDB] 连接成功！耗时: ${duration}ms`);
      return client;
    }).catch((error) => {
      console.error('❌ [MongoDB] 连接失败:', error);
      throw error;
    });
  } else {
    console.log('♻️  [MongoDB] 复用现有连接');
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export { clientPromise };

// Helper function to get database instance
export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db();
}

// Helper function to check database connection
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await clientPromise;
    await client.db().command({ ping: 1 });
    console.log("Successfully connected to MongoDB.");
    return true;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    return false;
  }
}
