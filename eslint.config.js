import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["DO_NOT_READ", "dist", "node_modules"],
  },
  {
    files: ["eslint.config.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
