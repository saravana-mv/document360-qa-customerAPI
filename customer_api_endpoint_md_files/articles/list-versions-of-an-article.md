# List versions of an article.

> Returns all versions of the article, including both draft and published versions.
Each version includes its status (Draft, Published, etc.), creation date, and the user who created it.
Hidden or deleted articles will not be returned. Version numbers are 1-based and sequential.

## OpenAPI

````json GET /v3/projects/{project_id}/articles/{article_id}/versions
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
    "/v3/projects/{project_id}/articles/{article_id}/versions": {
      "get": {
        "tags": [
          "Articles"
        ],
        "summary": "List versions of an article.",
        "description": "Returns all versions of the article, including both draft and published versions.\r\nEach version includes its status (Draft, Published, etc.), creation date, and the user who created it.\r\nHidden or deleted articles will not be returned. Version numbers are 1-based and sequential.",
        "operationId": "getArticleArticleVersions",
        "parameters": [
          {
            "$ref": "#/components/parameters/ProjectId"
          },
          {
            "$ref": "#/components/parameters/ArticleId"
          },
          {
            "$ref": "#/components/parameters/LangCode"
          },
          {
            "$ref": "#/components/parameters/Page"
          },
          {
            "$ref": "#/components/parameters/PageSize"
          },
          {
            "name": "cursor",
            "in": "query",
            "description": "Opaque cursor from a previous response's `next_cursor`. When provided, `page` is ignored.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "include_total_count",
            "in": "query",
            "description": "Set to `true` to include `total_count` in the response. Default: `false`.",
            "schema": {
              "type": "boolean",
              "default": false
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Article versions retrieved successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ArticleVersionResponsePaginatedResponse"
                },
                "examples": {
                  "Article versions retrieved successfully": {
                    "summary": "Returns a list of all versions for the specified article, including both draft and published versions.",
                    "value": {
                      "data": [
                        {
                          "version_number": 1,
                          "created_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                          "created_at": "2025-06-01T09:00:00Z",
                          "modified_at": "2025-06-10T12:00:00Z",
                          "modified_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                          "base_version": 0,
                          "status": 3,
                          "profile_url": "https://cdn.example.com/avatars/jane-doe.png"
                        },
                        {
                          "version_number": 2,
                          "created_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                          "created_at": "2025-07-15T10:00:00Z",
                          "modified_at": "2025-08-01T14:00:00Z",
                          "modified_by": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
                          "base_version": 1,
                          "status": 3,
                          "profile_url": "https://cdn.example.com/avatars/jane-doe.png"
                        },
                        {
                          "version_number": 3,
                          "created_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                          "created_at": "2025-08-10T11:00:00Z",
                          "modified_at": "2025-08-15T14:30:00Z",
                          "modified_by": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
                          "base_version": 2,
                          "status": 0,
                          "profile_url": "https://cdn.example.com/avatars/jane-doe.png"
                        }
                      ],
                      "success": true,
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
          "404": {
            "description": "Article not found.",
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Resource not found": {
                    "summary": "The requested resource was not found.",
                    "value": {
                      "type": "https://developer.document360.com/errors/not-found",
                      "title": "Not Found.",
                      "status": 404,
                      "detail": "The requested resource does not exist or has been deleted.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "RESOURCE_NOT_FOUND",
                          "message": "The requested resource was not found.",
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
      "ArticleId": {
        "name": "article_id",
        "in": "path",
        "description": "The unique identifier of the article. Retrieve article IDs from `GET /v3/projects/{project_id}/articles`.",
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
      },
      "Page": {
        "name": "page",
        "in": "query",
        "description": "Page number (1-based). Defaults to 1.",
        "schema": {
          "minimum": 1,
          "type": "integer",
          "format": "int32",
          "default": 1
        }
      },
      "PageSize": {
        "name": "page_size",
        "in": "query",
        "description": "Number of results per page. Defaults to 25. Maximum 100.",
        "schema": {
          "maximum": 100,
          "minimum": 1,
          "type": "integer",
          "format": "int32",
          "default": 25
        }
      }
    },
    "schemas": {
      "ArticleVersionResponsePaginatedResponse": {
        "required": [
          "data",
          "pagination",
          "request_id",
          "success"
        ],
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ArticleVersionResponse"
            },
            "description": "List of items for the current page."
          },
          "pagination": {
            "allOf": [
              {
                "$ref": "#/components/schemas/PaginationInfo"
              }
            ],
            "description": "Pagination metadata.",
            "readOnly": true
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
        "description": "Paginated API response containing a list of items."
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
      "ArticleVersionResponse": {
        "required": [
          "status"
        ],
        "type": "object",
        "properties": {
          "version_number": {
            "type": "integer",
            "description": "The version number of this article revision.",
            "format": "int32",
            "example": 3
          },
          "created_by": {
            "type": "string",
            "description": "The user ID of who created this version. Corresponds to a user from `GET /v3/projects/{projectId}/users`.",
            "nullable": true,
            "example": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
          },
          "created_at": {
            "type": "string",
            "description": "The date and time this version was created.",
            "format": "date-time",
            "readOnly": true,
            "example": "2025-08-10T11:00:00Z"
          },
          "modified_at": {
            "type": "string",
            "description": "The date and time this version was last modified.",
            "format": "date-time",
            "readOnly": true,
            "example": "2025-08-15T14:30:00Z"
          },
          "modified_by": {
            "type": "string",
            "description": "The user ID of who last modified this version. Corresponds to a user from `GET /v3/projects/{projectId}/users`.",
            "nullable": true,
            "example": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e"
          },
          "base_version": {
            "type": "integer",
            "description": "The version number this revision was based on.",
            "format": "int32",
            "example": 2
          },
          "status": {
            "enum": [
              "draft",
              "published",
              "forked",
              "unpublished"
            ],
            "type": "string",
            "allOf": [
              {
                "$ref": "#/components/schemas/ArticleStatus"
              }
            ],
            "description": "The publication status of this version. Possible values: 0 = Draft, 3 = Published.",
            "x-enumNames": [
              "Draft",
              "Published",
              "Forked",
              "Unpublished"
            ],
            "x-enum-varnames": [
              "Draft",
              "Published",
              "Forked",
              "Unpublished"
            ],
            "x-ms-enum": {
              "name": "ArticleStatus",
              "modelAsString": true
            }
          },
          "profile_url": {
            "type": "string",
            "description": "The profile image URL of the version creator.",
            "nullable": true,
            "example": "https://cdn.example.com/avatars/jane-doe.png"
          }
        },
        "additionalProperties": false,
        "description": "Article version summary."
      },
      "PaginationInfo": {
        "required": [
          "has_more",
          "page",
          "page_size"
        ],
        "type": "object",
        "properties": {
          "page": {
            "type": "integer",
            "description": "Current page number (1-based). Returns 0 when using cursor-based pagination.",
            "format": "int32"
          },
          "page_size": {
            "type": "integer",
            "description": "Number of items per page.",
            "format": "int32"
          },
          "total_count": {
            "type": "integer",
            "description": "Total number of items across all pages. Only populated when `include_total_count=true` is specified in the request.",
            "format": "int64",
            "nullable": true
          },
          "has_more": {
            "type": "boolean",
            "description": "Whether additional pages are available."
          },
          "next_cursor": {
            "type": "string",
            "description": "Opaque cursor to retrieve the next page of results. Pass this value as the `cursor` query parameter. Null when there are no more pages.",
            "nullable": true
          }
        },
        "additionalProperties": false,
        "description": "Metadata describing the current pagination state. Supports both offset-based\r\nand cursor-based pagination."
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
      "ArticleStatus": {
        "enum": [
          "draft",
          "published",
          "forked",
          "unpublished"
        ],
        "type": "string",
        "description": "The publication status of an article.",
        "x-enumNames": [
          "Draft",
          "Published",
          "Forked",
          "Unpublished"
        ],
        "x-enum-varnames": [
          "Draft",
          "Published",
          "Forked",
          "Unpublished"
        ],
        "x-ms-enum": {
          "name": "ArticleStatus",
          "modelAsString": true
        }
      }
    }
  }
}
````

