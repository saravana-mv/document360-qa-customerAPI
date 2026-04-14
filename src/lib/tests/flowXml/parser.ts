// Parses .flow.xml strings into ParsedFlow objects.
// Pure — no I/O, no registration.

import type { HttpMethod } from "../../../types/test.types";
import type { ParsedFlow, ParsedStep, ParsedCapture, ParsedAssertion } from "./types";

export class FlowXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowXmlParseError";
  }
}

const SUPPORTED_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Parse a .flow.xml document. Throws FlowXmlParseError on malformed input. */
export function parseFlowXml(xml: string): ParsedFlow {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new FlowXmlParseError(`Malformed XML: ${parserError.textContent?.split("\n")[0] || "unknown"}`);
  }

  const root = doc.documentElement;
  if (!root || root.localName !== "flow") {
    throw new FlowXmlParseError("Root element must be <flow>");
  }

  const name = textOf(root, "name");
  if (!name) throw new FlowXmlParseError("<flow> requires a <name>");

  const entity = textOf(root, "entity") || textOf(root, "group") || "Untagged";
  const description = textOf(root, "description");
  const stopOnFailure = (textOf(root, "stopOnFailure") || "true").trim().toLowerCase() !== "false";

  const stepsRoot = childElement(root, "steps");
  if (!stepsRoot) throw new FlowXmlParseError("<flow> requires a <steps> element");

  const steps: ParsedStep[] = [];
  const stepEls = childElements(stepsRoot, "step");
  if (stepEls.length === 0) throw new FlowXmlParseError("<steps> must contain at least one <step>");

  for (const stepEl of stepEls) {
    steps.push(parseStep(stepEl));
  }

  return { name, entity, description, stopOnFailure, steps };
}

function parseStep(el: Element): ParsedStep {
  const numberAttr = el.getAttribute("number");
  const number = numberAttr ? parseInt(numberAttr, 10) : NaN;
  if (Number.isNaN(number)) throw new FlowXmlParseError("<step> requires a numeric 'number' attribute");

  const name = textOf(el, "name");
  if (!name) throw new FlowXmlParseError(`Step ${number}: missing <name>`);

  const methodRaw = (textOf(el, "method") || "").toUpperCase().trim();
  if (!SUPPORTED_METHODS.includes(methodRaw as HttpMethod)) {
    throw new FlowXmlParseError(`Step ${number}: unsupported method "${methodRaw}"`);
  }
  const method = methodRaw as HttpMethod;

  const path = textOf(el, "path");
  if (!path) throw new FlowXmlParseError(`Step ${number}: missing <path>`);

  const endpointRef = textOf(el, "endpointRef");
  const notes = textOf(el, "notes");

  // pathParams / queryParams
  const pathParams = parseParams(childElement(el, "pathParams"));
  const queryParams = parseParams(childElement(el, "queryParams"));

  // body
  const bodyEl = childElement(el, "body");
  const body = bodyEl ? bodyEl.textContent?.trim() : undefined;

  // captures
  const captures: ParsedCapture[] = [];
  const capturesRoot = childElement(el, "captures");
  if (capturesRoot) {
    for (const cap of childElements(capturesRoot, "capture")) {
      const variable = cap.getAttribute("variable") || "";
      const source = cap.getAttribute("source") || "";
      const fromAttr = (cap.getAttribute("from") || "response").toLowerCase();
      if (!variable || !source) {
        throw new FlowXmlParseError(`Step ${number}: <capture> requires 'variable' and 'source' attributes`);
      }
      const from: "response" | "request" | "computed" =
        fromAttr === "request" ? "request" :
        fromAttr === "computed" ? "computed" :
        "response";
      captures.push({ variable, source, from });
    }
  }

  // assertions
  const assertions: ParsedAssertion[] = [];
  const assertionsRoot = childElement(el, "assertions");
  if (assertionsRoot) {
    for (const a of childElements(assertionsRoot, "assertion")) {
      const type = (a.getAttribute("type") || "").toLowerCase();
      if (type === "status") {
        const code = parseInt(a.getAttribute("code") || "", 10);
        if (Number.isNaN(code)) throw new FlowXmlParseError(`Step ${number}: status assertion missing 'code'`);
        assertions.push({ type: "status", code });
      } else if (type === "field-exists") {
        const field = a.getAttribute("field") || "";
        if (!field) throw new FlowXmlParseError(`Step ${number}: field-exists assertion missing 'field'`);
        assertions.push({ type: "field-exists", field });
      } else if (type === "field-equals") {
        const field = a.getAttribute("field") || "";
        const value = a.getAttribute("value") ?? "";
        if (!field) throw new FlowXmlParseError(`Step ${number}: field-equals assertion missing 'field'`);
        assertions.push({ type: "field-equals", field, value });
      } else if (type === "array-not-empty") {
        const field = a.getAttribute("field") || "";
        if (!field) throw new FlowXmlParseError(`Step ${number}: array-not-empty assertion missing 'field'`);
        assertions.push({ type: "array-not-empty", field });
      } else {
        throw new FlowXmlParseError(`Step ${number}: unknown assertion type "${type}"`);
      }
    }
  }

  // teardown flag
  let teardown = false;
  const flagsEl = childElement(el, "flags");
  if (flagsEl) {
    const t = flagsEl.getAttribute("teardown");
    teardown = t === "true" || t === "1";
  }

  return {
    number,
    name,
    endpointRef,
    method,
    path,
    pathParams,
    queryParams,
    body,
    captures,
    assertions,
    teardown,
    notes,
  };
}

function parseParams(root: Element | null): Record<string, string> {
  if (!root) return {};
  const out: Record<string, string> = {};
  for (const p of childElements(root, "param")) {
    const name = p.getAttribute("name");
    if (!name) continue;
    out[name] = (p.textContent || "").trim();
  }
  return out;
}

// ── DOM helpers (namespace-agnostic — match by localName) ─────────────────────

function childElements(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (c.localName === localName) out.push(c);
  }
  return out;
}

function childElement(parent: Element, localName: string): Element | null {
  return childElements(parent, localName)[0] ?? null;
}

function textOf(parent: Element, localName: string): string | undefined {
  const el = childElement(parent, localName);
  return el ? (el.textContent || "").trim() : undefined;
}
