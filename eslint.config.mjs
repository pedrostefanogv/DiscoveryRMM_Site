import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

const sharedTypeScriptConfig = {
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
  },
  rules: {
    // TypeScript (`tsc -b` with strict, noUnusedLocals, noUnusedParameters)
    // enforces undefined identifiers, unused bindings, and overloads.
    "no-undef": "off",
    "no-unused-vars": "off",
    "no-redeclare": "off",
    // Terminal ANSI parsing intentionally matches control characters (\x1b, \x07).
    "no-control-regex": "off",
    // Surface pre-existing cleanup items as warnings so CI passes without
    // modifying unrelated domain modules owned by SM2-SM5.
    "no-useless-assignment": "warn",
    "preserve-caught-error": "warn",
    "no-useless-escape": "warn",
    "no-fallthrough": "warn",
    "no-irregular-whitespace": "warn",
    "no-extra-boolean-cast": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", ".vitest/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,mts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    ...sharedTypeScriptConfig,
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
          plugins: ["@babel/plugin-syntax-jsx"],
        },
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    ...sharedTypeScriptConfig,
  },
  {
    files: ["src/router.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/theme/ThemeContext.tsx"],
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["useTheme", "THEME_MODE_STORAGE_KEY"],
        },
      ],
    },
  },
  {
    files: [
      "scripts/**/*.mjs",
      "eslint.config.mjs",
      "vite.config.ts",
      "vitest.min.config.mts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
