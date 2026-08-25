import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".tf-approval-gate/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='exec']",
          message: "Use execFile via src/utils/exec.ts, never the shell-invoking exec().",
        },
      ],
    },
  },
];
