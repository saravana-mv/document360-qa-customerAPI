# Bulk unpublish articles, reverting them to draft.

> Unpublishes up to 100 articles in a single request, reverting each to draft status. Each article is processed
independently — if one fails, others are still unpublished. The response includes per-article success/failure results.
Requires `PublishArticles` permission. Unpublished articles retain their content but are no longer visible on the knowledge base site.

## OpenAPI

````json POST /v3/projects/{project_id}/articles/bulk/unpublish
{
  "openapi": "3.0.1",
  "info": {
    "title": "Document360 Customer API",
    "description": "Document360 RESTful APIs will allow you to integrate your documentation with your software, allowing you to easily onboard new users, manage your articles and more.\n\nYou can find detailed API documentation here : [API Documentation](https://apidocs.document360.io/docs)\n\n## Rate Limits\nAll endpoints are rate-limited per API token per project. Default limits vary by plan. When rate-limited, responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Use exponential backoff with jitter for optimal retry behavior.",
    "termsOfService": "https://document360.com/terms",
    "contact": {
      "name": "Document360 Support",
      "url": "https://document360.io/contact-us/",
      "email": "support@document360.com"
    },
    "license": {
      "name": "Proprietary",
      "url": "https://document360.com/terms/api-license"
    },
    "version": "3.0.0"
  },
  "servers": [
    {
      "url": "https://apihub.berlin.document360.net",
      "description": "Document 360 API Hub"
    }
  ],
  "paths": {
    "/v3/projects/{project_id}/articles/bulk/unpublish": {
      "post": {
        "tags": [
          "Articles"
        ],
        "summary": "Bulk unpublish articles, reverting them to draft.",
        "description": "Unpublishes up to 100 articles in a single request, reverting each to draft status. Each article is processed\r\nindependently — if one fails, others are still unpublished. The response includes per-article success/failure results.\r\nRequires `PublishArticles` permission. Unpublished articles retain their content but are no longer visible on the knowledge base site.",
        "operationId": "bulkUnpublishArticleArticles",
        "parameters": [
          {
            "$ref": "#/components/parameters/ProjectId"
          },
          {
            "$ref": "#/components/parameters/LangCode"
          }
        ],
        "requestBody": {
          "description": "The list of article IDs to unpublish. Maximum 100 articles per request.",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/BulkIdsRequest"
              },
              "examples": {
                "Bulk operation by IDs": {
                  "summary": "Provide a list of article IDs to publish or unpublish. Maximum 100 IDs per request.",
                  "value": {
                    "ids": [
                      "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
                      "c5d6e7f8-9a0b-1c2d-3e4f-5a6b7c8d9e0f"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Articles unpublished successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/BulkOperationResultListApiResponse"
                },
                "examples": {
                  "Bulk operation completed": {
                    "summary": "Results for each item in the bulk request. Check individual success flags to identify failures.",
                    "value": {
                      "data": [
                        {
                          "index": 0,
                          "id": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
                          "success": true,
                          "details": "Article created successfully."
                        },
                        {
                          "index": 1,
                          "id": "c5d6e7f8-9a0b-1c2d-3e4f-5a6b7c8d9e0f",
                          "success": true,
                          "details": "Article created successfully."
                        }
                      ],
                      "success": true,
                      "request_id": "req_abc123def456",
                      "errors": null,
                      "warnings": null
                    }
                  },
                  "Bulk operation with partial failure": {
                    "summary": "Some items in the bulk request may fail while others succeed. The top-level success is false when any item fails. Use the index field to correlate results with input items.",
                    "value": {
                      "data": [
                        {
                          "index": 0,
                          "id": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
                          "success": true,
                          "details": "Article created successfully."
                        },
                        {
                          "index": 1,
                          "id": null,
                          "success": false,
                          "details": "The Title field is required."
                        }
                      ],
                      "success": false,
                      "request_id": "req_abc123def456",
                      "errors": null,
                      "warnings": null
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Authentication token is missing or invalid.",
            "headers": {
              "WWW-Authenticate": {
                "description": "Indicates the authentication scheme required. Returns `Bearer` with optional `error` and `error_description` parameters per RFC 6750.",
                "schema": {
                  "type": "string"
                }
              }
            },
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Missing or invalid token": {
                    "summary": "Authentication token is missing or invalid.",
                    "value": {
                      "type": "https://developer.document360.com/errors/unauthorized",
                      "title": "Unauthorized.",
                      "status": 401,
                      "detail": "The authentication token is missing or has expired.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "UNAUTHORIZED",
                          "message": "Bearer token is missing or invalid.",
                          "field": null,
                          "details": null
                        }
                      ],
                      "warnings": null
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "The request body is malformed or contains invalid JSON.",
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                }
              }
            }
          },
          "429": {
            "description": "Rate limit exceeded. Retry after the duration specified in the Retry-After header.",
            "headers": {
              "Retry-After": {
                "description": "Number of seconds to wait before retrying the request. Use exponential backoff with jitter for optimal retry behavior.",
                "schema": {
                  "type": "integer",
                  "format": "int32"
                }
              },
              "X-RateLimit-Limit": {
                "description": "The maximum number of requests allowed in the current time window. Limits are applied per API token per project.",
                "schema": {
                  "type": "integer",
                  "format": "int32"
                }
              },
              "X-RateLimit-Remaining": {
                "description": "The number of requests remaining in the current time window. When this reaches 0, subsequent requests will receive a 429 response.",
                "schema": {
                  "type": "integer",
                  "format": "int32"
                }
              },
              "X-RateLimit-Reset": {
                "description": "The UTC epoch timestamp (in seconds) when the current rate limit window resets.",
                "schema": {
                  "type": "integer",
                  "format": "int64"
                }
              }
            },
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Rate limit exceeded": {
                    "summary": "Rate limit exceeded.",
                    "value": {
                      "type": "https://developer.document360.com/errors/too-many-requests",
                      "title": "Too Many Requests.",
                      "status": 429,
                      "detail": "Rate limit exceeded. Retry after the duration specified in the Retry-After header.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "TOO_MANY_REQUESTS",
                          "message": "Rate limit exceeded. Retry after the duration specified in the Retry-After header.",
                          "field": null,
                          "details": null
                        }
                      ],
                      "warnings": null
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "An unexpected server error occurred.",
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Unexpected server error": {
                    "summary": "Unexpected server error.",
                    "value": {
                      "type": "https://developer.document360.com/errors/internal-error",
                      "title": "Internal Server Error.",
                      "status": 500,
                      "detail": "An unexpected error occurred. Please try again or contact support.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "INTERNAL_SERVER_ERROR",
                          "message": "An unexpected error occurred.",
                          "field": null,
                          "details": null
                        }
                      ],
                      "warnings": null
                    }
                  }
                }
              }
            }
          }
        },
        "security": [
          {
            "Bearer": [
              "customerApi"
            ]
          }
        ]
      }
    }
  },
  "components": {
    "parameters": {
      "ProjectId": {
        "name": "project_id",
        "in": "path",
        "description": "The unique identifier of the project. Retrieve project IDs from `GET /v3/projects`.",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid",
          "example": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d"
        }
      },
      "LangCode": {
        "name": "lang_code",
        "in": "query",
        "description": "ISO 639-1 language code (e.g., `en`, `fr`). Defaults to the project's primary language if omitted.",
        "schema": {
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$",
          "type": "string",
          "example": "en"
        }
      }
    },
    "schemas": {
      "BulkIdsRequest": {
        "required": [
          "ids"
        ],
        "type": "object",
        "properties": {
          "ids": {
            "maxItems": 100,
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "The list of entity identifiers. Maximum 100 items per request."
          }
        },
        "additionalProperties": false,
        "description": "Request containing a list of entity IDs for bulk publish or unpublish operations."
      },
      "BulkOperationResultListApiResponse": {
        "required": [
          "data",
          "request_id",
          "success"
        ],
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/BulkOperationResult"
            },
            "description": "Response data payload."
          },
          "success": {
            "type": "boolean",
            "description": "Whether the API request was successful.",
            "readOnly": true
          },
          "request_id": {
            "minLength": 1,
            "type": "string",
            "description": "Unique identifier for request tracing and correlation.",
            "readOnly": true
          },
          "errors": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ApiError"
            },
            "description": "List of errors if the request failed.",
            "nullable": true
          },
          "warnings": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ApiWarning"
            },
            "description": "List of non-fatal warnings from the request.",
            "nullable": true
          }
        },
        "additionalProperties": false,
        "description": "Generic API response wrapper containing typed data."
      },
      "V3ProblemDetails": {
        "required": [
          "status",
          "title",
          "type"
        ],
        "type": "object",
        "properties": {
          "type": {
            "minLength": 1,
            "type": "string",
            "description": "URI reference identifying the error type (links to documentation)."
          },
          "title": {
            "minLength": 1,
            "type": "string",
            "description": "Short human-readable summary of the error type."
          },
          "status": {
            "type": "integer",
            "description": "HTTP status code.",
            "format": "int32"
          },
          "detail": {
            "type": "string",
            "description": "Human-readable explanation specific to this occurrence.",
            "nullable": true
          },
          "instance": {
            "type": "string",
            "description": "URI of the request that generated the error.",
            "nullable": true
          },
          "trace_id": {
            "type": "string",
            "description": "Request trace identifier for correlation.",
            "nullable": true
          },
          "errors": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ApiError"
            },
            "description": "Structured list of specific errors (extension field).",
            "nullable": true
          },
          "warnings": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ApiWarning"
            },
            "description": "Non-fatal warnings (extension field).",
            "nullable": true
          }
        },
        "additionalProperties": false,
        "description": "RFC 7807 Problem Details response for V3 API errors.\r\nContent-Type: application/problem+json"
      },
      "BulkOperationResult": {
        "type": "object",
        "properties": {
          "index": {
            "type": "integer",
            "description": "The zero-based position of this item in the original request array, enabling correlation of results to input items even when the operation fails and no ID is available.",
            "format": "int32",
            "example": 0
          },
          "id": {
            "type": "string",
            "description": "The identifier of the item that was processed. May be null for failed create operations where no resource was created.",
            "format": "uuid",
            "nullable": true,
            "readOnly": true,
            "example": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d"
          },
          "success": {
            "type": "boolean",
            "description": "Whether the operation succeeded for this item.",
            "readOnly": true,
            "example": true
          },
          "details": {
            "type": "string",
            "description": "Additional details or error message for the operation.",
            "nullable": true,
            "example": "Article created successfully."
          }
        },
        "additionalProperties": false,
        "description": "Result of a bulk operation on a single item."
      },
      "ApiError": {
        "required": [
          "code",
          "message"
        ],
        "type": "object",
        "properties": {
          "code": {
            "minLength": 1,
            "type": "string",
            "description": "Machine-readable error code (e.g. VALIDATION_ERROR, RESOURCE_NOT_FOUND)."
          },
          "message": {
            "minLength": 1,
            "type": "string",
            "description": "Human-readable error message."
          },
          "field": {
            "type": "string",
            "description": "The request field that caused the error, if applicable.",
            "nullable": true
          },
          "details": {
            "type": "string",
            "description": "Additional context about the error.",
            "nullable": true
          }
        },
        "additionalProperties": false,
        "description": "Represents an error returned by the API."
      },
      "ApiWarning": {
        "required": [
          "code",
          "message"
        ],
        "type": "object",
        "properties": {
          "code": {
            "minLength": 1,
            "type": "string",
            "description": "Machine-readable warning code."
          },
          "message": {
            "minLength": 1,
            "type": "string",
            "description": "Human-readable warning message."
          }
        },
        "additionalProperties": false,
        "description": "Represents a non-fatal warning from the API."
      }
    }
  }
}
````

