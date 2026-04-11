import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Prevent the real @azure/functions app registration from running
    "^@azure/functions$": "<rootDir>/src/__tests__/__mocks__/@azure/functions.ts",
  },
};

export default config;
