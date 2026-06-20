/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    // onnxruntime-web ships native node bindings we don't need in the browser
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node": false,
    };
    return config;
  },
  // Serve onnxruntime-web .wasm files from /public/ort/
  async headers() {
    return [
      {
        source: "/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
      {
        source: "/:path*.mjs",
        headers: [{ key: "Content-Type", value: "text/javascript" }],
      },
    ];
  },
};

module.exports = nextConfig;
