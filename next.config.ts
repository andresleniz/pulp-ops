import type { NextConfig } from "next"
import path from "path"
import os from "os"

// Move .next cache to local disk — avoids OneDrive write errors
const nextConfig: NextConfig = {
  distDir: path.join(os.homedir(), ".next-pulp-ops"),
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        process.env.VERCEL_URL ?? "",
        process.env.NEXT_PUBLIC_APP_URL ?? "",
      ].filter(Boolean),
    },
  },
}

export default nextConfig