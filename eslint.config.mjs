import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  globalIgnores([".open-next/**", "public/pdfjs/**"]),
  { extends: [...next] },
]);
