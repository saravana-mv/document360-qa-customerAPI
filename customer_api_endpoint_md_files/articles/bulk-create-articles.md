# Bulk create articles.

> Creates multiple articles in a single request. Each article is created independently; if one
fails validation, the others are still created. The response includes per-article success/failure
details. Maximum 100 articles per request. All articles are created in draft status.

## OpenAPI

````json POST /v3/projects/{project_id}/articles/bulk
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
    "/v3/projects/{project_id}/articles/bulk": {
      "post": {
        "tags": [
          "Articles"
        ],
        "summary": "Bulk create articles.",
        "description": "Creates multiple articles in a single request. Each article is created independently; if one\r\nfails validation, the others are still created. The response includes per-article success/failure\r\ndetails. Maximum 100 articles per request. All articles are created in draft status.",
        "operationId": "bulkCreateArticleArticles",
        "parameters": [
          {
            "$ref": "#/components/parameters/ProjectId"
          }
        ],
        "requestBody": {
          "description": "Bulk article creation details. Maximum 100 articles per request.",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/BulkCreateArticleRequest"
              },
              "examples": {
                "Bulk create two articles": {
                  "summary": "Creates multiple articles in a single request. Maximum 100 articles per request. All articles are created in draft status.",
                  "value": {
                    "articles": [
                      {
                        "title": "Getting Started with Single Sign-On",
                        "content": "# Introduction\nThis guide walks you through configuring SSO.",
                        "category_id": "f4a5b6c7-d8e9-0a1b-2c3d-4e5f6a7b8c9d",
                        "project_version_id": "1c2d3e4f-5a6b-7c8d-9e0f-a1b2c3d4e5f6",
                        "order": 0,
                        "user_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                        "content_type": null,
                        "slug": null
                      },
                      {
                        "title": "Configuring SAML Identity Providers",
                        "content": "# SAML Configuration\nStep-by-step SAML setup instructions.",
                        "category_id": "f4a5b6c7-d8e9-0a1b-2c3d-4e5f6a7b8c9d",
                        "project_version_id": "1c2d3e4f-5a6b-7c8d-9e0f-a1b2c3d4e5f6",
                        "order": 0,
                        "user_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                        "content_type": null,
                        "slug": null
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Articles created successfully.",
            "headers": {
              "Location": {
                "description": "URL of the newly created resource.",
                "schema": {
                  "type": "string",
                  "format": "uri"
                }
              }
            },
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
          "422": {
            "description": "Validation failed.",
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Validation failed": {
                    "summary": "The request body contains invalid data.",
                    "value": {
                      "type": "https://developer.document360.com/errors/validation-error",
                      "title": "Unprocessable Entity.",
                      "status": 422,
                      "detail": "One or more fields failed validation.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "VALIDATION_ERROR",
                          "message": "This field is required.",
                          "field": "title",
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
      }
    },
    "schemas": {
      "BulkCreateArticleRequest": {
        "required": [
          "articles"
        ],
        "type": "object",
        "properties": {
          "articles": {
            "maxItems": 100,
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CreateArticleRequest"
            },
            "description": "The list of articles to create. Maximum 100 items per request."
          }
        },
        "additionalProperties": false,
        "description": "Request to bulk create articles."
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
      "CreateArticleRequest": {
        "required": [
          "project_version_id",
          "title"
        ],
        "type": "object",
        "properties": {
          "title": {
            "minLength": 1,
            "type": "string",
            "description": "The title of the article.",
            "example": "Getting Started with Single Sign-On"
          },
          "content": {
            "type": "string",
            "description": "The body content of the article.",
            "nullable": true,
            "example": "# Introduction\nThis guide walks you through configuring SSO for your organization."
          },
          "category_id": {
            "type": "string",
            "description": "The identifier of the category to place the article in. Retrieve category IDs from `GET /v3/projects/{projectId}/categories`.",
            "nullable": true,
            "example": "f4a5b6c7-d8e9-0a1b-2c3d-4e5f6a7b8c9d"
          },
          "project_version_id": {
            "minLength": 1,
            "type": "string",
            "description": "The project version to create the article in. Retrieve version IDs from `GET /v3/projects/{projectId}/project-versions`.",
            "example": "1c2d3e4f-5a6b-7c8d-9e0f-a1b2c3d4e5f6"
          },
          "order": {
            "type": "integer",
            "description": "The display order of the article within its category.",
            "format": "int32",
            "example": 5
          },
          "user_id": {
            "type": "string",
            "description": "The identifier of the user creating the article. Required for API token (M2M) authentication. When using a user access token (OAuth), this field is ignored — the user ID is resolved from the token. Retrieve user IDs from `GET /v3/projects/{projectId}/users`.",
            "nullable": true,
            "example": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
          },
          "content_type": {
            "allOf": [
              {
                "$ref": "#/components/schemas/ContentType"
              }
            ],
            "description": "The editor content type for the article. Possible values: 0 = Markdown, 1 = Wysiwyg (rich text), 2 = Block.",
            "nullable": true
          },
          "slug": {
            "type": "string",
            "description": "The custom URL slug for the article.",
            "nullable": true,
            "readOnly": true,
            "example": "getting-started-with-single-sign-on"
          }
        },
        "additionalProperties": false,
        "description": "Request to create a new article."
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
      },
      "ContentType": {
        "enum": [
          "markdown",
          "wysiwyg",
          "block"
        ],
        "type": "string",
        "description": "The editor content type used for an article.",
        "x-enumNames": [
          "Markdown",
          "Wysiwyg",
          "Block"
        ],
        "x-enum-varnames": [
          "Markdown",
          "Wysiwyg",
          "Block"
        ],
        "x-ms-enum": {
          "name": "ContentType",
          "modelAsString": true
        }
      }
    }
  }
}
````

