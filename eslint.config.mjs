import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

export default [
  {
    ignores: [
      "node_modules/**",
      "docs/**",
      "img/**",
      "css/**",
      "back/migrations/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: {
        window: "readonly",
        document: "readonly",
        WebSocket: "readonly",
        AudioContext: "readonly",
        Audio: "readonly",
        console: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "import/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {},
      sourceType: "module",
      ecmaVersion: 2022,
      globals: {
        window: "readonly",
        document: "readonly",
        WebSocket: "readonly",
        AudioContext: "readonly",
        Audio: "readonly",
        console: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "import/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
];
