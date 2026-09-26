import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* The SOA statement-request attachment is a fixed workbook read from disk at request time and
     stamped per vendor. Nothing imports it, so tracing cannot infer it, and without this the file
     is absent from the deployed bundle and every send fails at the point of attaching it. */
  outputFileTracingIncludes: {
    '/api/**': ['./assets/soa/**'],
    '/soa-consolidation/**': ['./assets/soa/**'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  async headers() {
    return [
      {
        // The supplier portal is reached with a write-capable token in the query string,
        // and the page embeds a third-party (SharePoint) help video. Suppress the Referer
        // entirely so that token cannot leak to any outbound origin.
        source: '/supplier-update/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/supplier-update',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
