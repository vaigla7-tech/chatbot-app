import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Admin pages load data on mount (fetch-then-setState); keep this visible as a warning
      // rather than blocking until the pages move to server components / a data library.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/embed.js"],
  },
];

export default config;
