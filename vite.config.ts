import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { ekgamerShellPlugins } from "@ekgamer/game-shell/vite";

// The shell's build points the game at ../game-shell/, which is where it sits on Eklavya's
// hosting. This preview runs on its own on Vercel, so load the same hosted shell from there.
const SHELL_BASE = "https://content.dev.eklavya.me/devek.designer/game-shell/";

function hostedShell(): Plugin {
  return {
    name: "hosted-shell",
    transformIndexHtml: {
      order: "post",
      handler: (html) => html.replaceAll("../game-shell/", SHELL_BASE),
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  assetsInclude: ["**/*.lottie"],
  plugins: [
    ...(ekgamerShellPlugins(mode) as import("vite").PluginOption[]),
    hostedShell(),
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
