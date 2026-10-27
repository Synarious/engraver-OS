import type {NextConfig} from 'next';
import { AlphaTabWebPackPlugin } from '@coderline/alphatab-webpack';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', 
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev, isServer, webpack}) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
        'node:fs': false,
        'node:crypto': false,
      };
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:/
        })
      );
      config.plugins.push(
        new AlphaTabWebPackPlugin({
          assetOutputDir: false,
        })
      );
    }
    return config;
  },
};

export default nextConfig;
