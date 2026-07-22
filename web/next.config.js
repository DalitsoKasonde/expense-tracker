/** @type {import('next').NextConfig} */
const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  "10.105.48.90",
  "10.213.95.90",
  "192.168.2.74",
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
];

const nextConfig = {
  typedRoutes: true,
  allowedDevOrigins,
  turbopack: {},
};

module.exports = nextConfig;
