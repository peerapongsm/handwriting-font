/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/handwriting-font",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
