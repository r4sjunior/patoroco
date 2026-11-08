import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A pasta do usuário também é um repositório: fixa a raiz neste projeto.
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
