import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }
];

const nextConfig: NextConfig = {
  // Lets the security test runner build into its own folder without touching the dev server's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        // Legacy public lesson page. Lessons are only served inside the authorized classroom.
        source: "/courses/:courseSlug/lessons/:lessonSlug",
        destination: "/learn/courses/:courseSlug/lessons/:lessonSlug",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
