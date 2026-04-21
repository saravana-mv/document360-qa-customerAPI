// Cosmos DB client for FlowForge multi-user data layer.
//
// Database: flowforge (serverless)
// Containers:
//   flows, ideas, test-runs — partitioned by /projectId
//   settings                — partitioned by /userId (per-user, cross-project)
//
// Follows the tokenStore.ts pattern: lazy-init client, cache container refs,
// auto-create database/containers on first access.

import { CosmosClient, Container, Database } from "@azure/cosmos";

const CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING ?? "";
const DATABASE_NAME = "flowforge";

const CONTAINER_DEFS = [
  { id: "flows", partitionKey: "/projectId" },
  { id: "ideas", partitionKey: "/projectId" },
  { id: "test-runs", partitionKey: "/projectId" },
  { id: "settings", partitionKey: "/userId" },
  { id: "users", partitionKey: "/tenantId" },
  { id: "api-keys", partitionKey: "/projectId" },
  { id: "audit-log", partitionKey: "/projectId" },
  { id: "flow-chat-sessions", partitionKey: "/projectId" },
] as const;

type ContainerName = (typeof CONTAINER_DEFS)[number]["id"];

let _client: CosmosClient | null = null;
let _database: Database | null = null;
let _dbEnsured = false;
const _containerCache = new Map<ContainerName, Container>();
const _containerEnsured = new Set<ContainerName>();

function getClient(): CosmosClient {
  if (_client) return _client;
  if (!CONNECTION_STRING) {
    throw new Error("COSMOS_CONNECTION_STRING is not set");
  }
  _client = new CosmosClient(CONNECTION_STRING);
  return _client;
}

async function ensureDatabase(): Promise<Database> {
  if (_database && _dbEnsured) return _database;
  const client = getClient();
  const { database } = await client.databases.createIfNotExists({ id: DATABASE_NAME });
  _database = database;
  _dbEnsured = true;
  return database;
}

async function ensureContainer(name: ContainerName): Promise<Container> {
  if (_containerEnsured.has(name)) {
    return _containerCache.get(name)!;
  }
  const db = await ensureDatabase();
  const def = CONTAINER_DEFS.find((d) => d.id === name)!;
  const { container } = await db.containers.createIfNotExists({
    id: def.id,
    partitionKey: { paths: [def.partitionKey] },
  });
  _containerCache.set(name, container);
  _containerEnsured.add(name);
  return container;
}

export async function getFlowsContainer(): Promise<Container> {
  return ensureContainer("flows");
}

export async function getIdeasContainer(): Promise<Container> {
  return ensureContainer("ideas");
}

export async function getTestRunsContainer(): Promise<Container> {
  return ensureContainer("test-runs");
}

export async function getSettingsContainer(): Promise<Container> {
  return ensureContainer("settings");
}

export async function getUsersContainer(): Promise<Container> {
  return ensureContainer("users");
}

export async function getApiKeysContainer(): Promise<Container> {
  return ensureContainer("api-keys");
}

export async function getAuditLogContainer(): Promise<Container> {
  return ensureContainer("audit-log");
}

export async function getFlowChatSessionsContainer(): Promise<Container> {
  return ensureContainer("flow-chat-sessions");
}
