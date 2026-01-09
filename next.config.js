/** @type {import('next').NextConfig} */
const nextConfig = {
  // 添加环境变量配置，使构建时可用的变量在客户端也可用
  // 注意：这些变量会在构建时被嵌入到客户端代码中，不应包含敏感信息
  env: {
    // 非敏感的公共环境变量可以在这里配置
    // 敏感信息只应通过服务端使用
  },

  // 启用 SWC 压缩（比 Terser 更快）
  swcMinify: true,

  // 生产环境优化
  productionBrowserSourceMaps: false, // 禁用生产环境的 source maps

  // 优化导入，减少 bundle 大小
  modularizeImports: {
    "@ant-design/icons": {
      transform: "@ant-design/icons/{{member}}",
    },
    "lodash-es": {
      transform: "lodash-es/{{member}}",
    },
  },

  images: {
    domains: [
      "images.unsplash.com",
      "iad.microlink.io",
      "avatars.githubusercontent.com",
      "next-blog.oss-cn-beijing.aliyuncs.com",
      "object-x.com.cn",
      "object-x.net.cn",
      "sealoshzh.site",
      "p0-xtjj-private.juejin.cn",
      process.env.QINIU_DOMAIN_HOSTNAME, // 从环境变量读取七牛域名
    ].filter(Boolean),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "**.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.aliyuncs.com",
      },
      {
        protocol: "http",
        hostname: "**.aliyuncs.com",
      },
      {
        protocol: "https",
        hostname: "object-x.com.cn",
      },
      {
        protocol: "https",
        hostname: "object-x.net.cn",
      },
      {
        protocol: "http",
        hostname: "object-x.com.cn",
      },
      {
        protocol: "http",
        hostname: "object-x.net.cn",
      },
      {
        protocol: "http",
        hostname: "**.qiniudn.com",
      },
      {
        protocol: "https",
        hostname: "**.qiniudn.com",
      },
      {
        protocol: "http",
        hostname: "**.qbox.me",
      },
      {
        protocol: "https",
        hostname: "**.qbox.me",
      },
      {
        protocol: "http",
        hostname: "**.clouddn.com",
      },
      {
        protocol: "https",
        hostname: "**.clouddn.com",
      },
    ],
  },
  transpilePackages: ["antd", "@ant-design/icons"],
  compiler: {
    // 生产环境移除 console
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error"], // 保留 console.error
          }
        : false,
  },
  async headers() {
    return [
      {
        // 为静态资源（JS、CSS、图片等）设置强缓存
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // 为图片资源设置缓存
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // 为 HTML 页面设置协商缓存
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // 为 API 路由禁用缓存并添加 CORS 配置
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.ALLOWED_ORIGIN || "*", // 生产环境应该设置具体域名
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // 忽略 exiftool-vendored 包的动态依赖警告
    config.ignoreWarnings = [
      {
        module: /node_modules\/exiftool-vendored/,
        message: /Critical dependency/,
      },
    ];

    return config;
  },
};

module.exports = nextConfig;
