/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from issuing trailing-slash 307 redirects on API routes,
  // which would cause Stripe (and other) webhooks to fail.
  skipTrailingSlashRedirect: true,
};

module.exports = nextConfig;
