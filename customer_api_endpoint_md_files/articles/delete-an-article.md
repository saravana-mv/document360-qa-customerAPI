# Delete an article.

> Permanently deletes the article and all its versions. This action is irreversible.
Consider unpublishing or hiding the article instead if you may need to restore it later.

## OpenAPI

````json DELETE /v3/projects/{project_id}/articles/{article_id}
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
    "/v3/projects/{project_id}/articles/{article_id}": {
      "delete": {
        "tags": [
          "Articles"
        ],
        "summary": "Delete an article.",
        "description": "Permanently deletes the article and all its versions. This action is irreversible.\r\nConsider unpublishing or hiding the article instead if you may need to restore it later.",
        "operationId": "deleteArticleArticle",
        "parameters": [
          {
            "$ref": "#/components/parameters/ProjectId"
          },
          {
            "$ref": "#/components/parameters/ArticleId"
          }
        ],
        "responses": {
          "204": {
            "description": "Article deleted successfully."
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
          "403": {
            "description": "User does not have delete permissions.",
            "content": {
              "application/problem+json": {
                "schema": {
                  "$ref": "#/components/schemas/V3ProblemDetails"
                },
                "examples": {
                  "Insufficient permissions": {
                    "summary": "Insufficient permissions for this resource.",
                    "value": {
                      "type": "https://developer.document360.com/errors/forbidden",
                      "title": "Forbidden.",
                      "status": 403,
                      "detail": "You do not have permission to perform this action.",
                      "instance": null,
                      "trace_id": "req_abc123def456",
                      "errors": [
                        {
                          "code": "FORBIDDEN",
                          "message": "Insufficient permissions for this project.",
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
      }
    },
    "schemas": {
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

