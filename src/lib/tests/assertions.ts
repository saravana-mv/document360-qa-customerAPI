import type { AssertionDef, TestExecutionResult, RunState, TestContext } from "../../types/test.types";

export function assertStatus(expected: number): AssertionDef {
  return {
    id: `http-status-${expected}`,
    description: `Response status is ${expected}`,
    check: (result) => result.httpStatus === expected,
  };
}

export function assertStatusRange(min: number, max: number): AssertionDef {
  return {
    id: `http-status-${min}-${max}`,
    description: `Response status is between ${min} and ${max}`,
    check: (result) => result.httpStatus !== undefined && result.httpStatus >= min && result.httpStatus <= max,
  };
}

export function assertBodyHasField(field: string): AssertionDef {
  return {
    id: `body-has-${field}`,
    description: `Response body has field "${field}"`,
    check: (result) => {
      const body = result.responseBody as Record<string, unknown>;
      return body !== null && typeof body === "object" && field in body;
    },
  };
}

export function assertBodyField(field: string, expected: unknown): AssertionDef {
  return {
    id: `body-field-${field}-equals`,
    description: `Response body field "${field}" equals expected value`,
    check: (result) => {
      const body = result.responseBody as Record<string, unknown>;
      return body !== null && typeof body === "object" && body[field] === expected;
    },
  };
}

export function assertStateField(stateKey: string, bodyField: string): AssertionDef {
  return {
    id: `state-${stateKey}-from-${bodyField}`,
    description: `State key "${stateKey}" captured from body field "${bodyField}"`,
    check: (_result, state) => stateKey in state && state[stateKey] !== undefined,
  };
}

export function runAssertions(
  assertions: AssertionDef[],
  result: TestExecutionResult,
  state: RunState,
  ctx?: TestContext,
): TestExecutionResult["assertionResults"] {
  return assertions.map((assertion) => {
    let passed = false;
    try {
      passed = assertion.check(result, state, ctx);
    } catch { /* assertion error = fail */ }
    return { id: assertion.id, description: assertion.description, passed };
  });
}
