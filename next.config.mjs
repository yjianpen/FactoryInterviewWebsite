/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Sandbox runs in a Vercel microVM and must not be bundled by webpack; the
    // module is imported dynamically only in the Vercel runtime.
    serverComponentsExternalPackages: ["@vercel/sandbox"],
  },
};

export default nextConfig;
