import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypeScript,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["app/(app)/settings/**/*.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
];

export default eslintConfig;
