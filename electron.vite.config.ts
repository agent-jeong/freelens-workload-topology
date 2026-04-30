import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import pluginExternal from "vite-plugin-external";

const freelensExternals = pluginExternal({
  externals: {
    "@freelensapp/extensions": "LensExtensions",
    react: "React",
    "react-dom": "ReactDOM",
    "react/jsx-runtime": "ReactJsxRuntime"
  }
});

export default defineConfig({
  main: {
    plugins: [freelensExternals],
    build: {
      lib: {
        entry: "src/main/index.ts",
        formats: ["cjs"]
      },
      rollupOptions: {
        output: {
          exports: "named"
        }
      }
    }
  },
  renderer: {
    plugins: [react(), freelensExternals],
    build: {
      lib: {
        entry: "src/renderer/index.tsx",
        formats: ["cjs"]
      },
      rollupOptions: {
        input: "src/renderer/index.tsx",
        output: {
          format: "cjs",
          exports: "named",
          entryFileNames: "index.js",
          assetFileNames: "assets/[name][extname]"
        }
      }
    }
  }
});
