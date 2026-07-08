import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom")) return "vendor";
          if (id.includes("node_modules/react")) return "vendor";
          if (id.includes("src/utils/locales")) return "locales";
          if (id.includes("node_modules/chess.js")) return "chess";
          if (id.includes("node_modules/axios")) return "axios";
          if (id.includes("node_modules/react-icons")) return "ui";
          if (id.includes("node_modules/react-toastify")) return "ui";
          if (id.includes("node_modules/zustand")) return "state";
          if (id.includes("node_modules/i18next")) return "i18n";
          if (id.includes("node_modules/react-i18next")) return "i18n";
        },
      },
    },
  },
});
