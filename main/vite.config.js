import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "version-offline-shell",
      apply: "build",
      async closeBundle() {
        const html = await readFile("dist/index.html", "utf8");
        const version = createHash("sha256")
          .update(html)
          .digest("hex")
          .slice(0, 12);
        const worker = await readFile("dist/serviceWorker.js", "utf8");
        await writeFile(
          "dist/serviceWorker.js",
          worker.replace("eor-react-v1", `eor-react-${version}`),
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "react";
        },
      },
    },
  },
});
