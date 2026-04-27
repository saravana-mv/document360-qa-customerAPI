/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { diagnostics: false }],
  },
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  maxWorkers: 2,
  moduleNameMapper: {
    // Prevent real @azure/functions app registration from running during tests
    "^@azure/functions$": "<rootDir>/src/__tests__/__mocks__/@azure/functions.ts",
  },
};
