/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "**.icloud.com" },
      { protocol: "https", hostname: "cvws.icloud-content.com" },
    ],
  },
};

export default nextConfig;
