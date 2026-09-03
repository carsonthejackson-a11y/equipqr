import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // node_modules here is a symlink into the sibling `equipqr` worktree
  // (git worktree setup), so Turbopack's root must include both to resolve
  // it — otherwise it panics with "Symlink [project]/node_modules is
  // invalid, it points out of the filesystem root".
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
