/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["docusign-esign"],
  },
};

module.exports = nextConfig;
