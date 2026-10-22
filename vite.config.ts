import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { ekgamerShellPlugins } from "@ekgamer/game-shell/vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  assetsInclude: ["**/*.lottie"],
  plugins: [
    ...(ekgamerShellPlugins(mode) as import("vite").PluginOption[]),
    react(),
  ],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
  build: {
    rollupOptions: {
      external: ["@ekgamer/game-shell"],
    },
  },
}));
