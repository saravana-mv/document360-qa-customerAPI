# Get article settings.

> Returns the SEO metadata, visibility flags, tags, status indicator, and related articles for the specified article.
Settings are language-specific; pass `langCode` to retrieve settings for a non-default language.
Use `PATCH /v3/projects/{projectId}/articles/{articleId}/settings` to update individual settings without affecting the article content.

## OpenAPI

````json GET /v3/projects/{project_id}/articles/{article_id}/settings
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
    "/v3/projects/{project_id}/articles/{article_id}/settings": {
      "get": {
        "tags": [
          "Articles"
        ],
        "summary": "Get article settings.",
        "description": "Returns the SEO metadata, visibility flags, tags, status indicator, and related articles for the specified article.\r\nSettings are language-specific; pass `langCode` to retrieve settings for a non-default language.\r\nUse `PATCH /v3/projects/{projectId}/articles/{articleId}/settings` to update individual settings without affecting the article content.",
        "operationId": "getArticleArticleSettings",
        "parameters": [
          {
            "$ref": "#/components/parameters/ProjectId"
          },
          {
            "$ref": "#/components/parameters/ArticleId"
          },
          {
            "$ref": "#/components/parameters/LangCode"
          }
        ],
        "responses": {
          "200": {
            "description": "Article settings retrieved successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ArticleSettingsResponseApiResponse"
                },
                "examples": {
                  "Article settings retrieved successfully": {
                    "summary": "Returns SEO settings, tags, status indicator, and related articles for the specified article.",
                    "value": {
                      "data": {
                        "slug": "getting-started-with-single-sign-on",
                        "seo_title": "SSO Setup Guide - Product Documentation",
                        "description": "Step-by-step instructions for configuring single sign-on with SAML or OIDC providers.",
                        "allow_comments": true,
                        "show_table_of_contents": true,
                        "featured_image_url": "https://cdn.example.com/images/sso-hero-banner.png",
                        "tags": [
                          "SSO",
                          "authentication",
                          "SAML",
                          "OIDC"
                        ],
                        "status_indicator": "updated",
                        "status_indicator_expiry_date": "2025-12-31T23:59:59Z",
                        "exclude_from_search": false,
                        "exclude_from_ai_search": false,
                        "exclude_from_external_search": false,
                        "related_articles": [
                          {
                            "id": "c5d6e7f8-9a0b-1c2d-3e4f-5a6b7c8d9e0f",
                            "title": "Configuring SAML Identity Providers",
                            "hidden": false,
                            "slug": "configuring-saml-identity-providers"
                          }
                        ],
                        "is_acknowledgement_enabled": false,
                        "url": "https://docs.example.com/en/articles/getting-started-with-single-sign-on"
                      },
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
      }
    },
    "schemas": {
      "ArticleSettingsResponseApiResponse": {
        "required": [
          "data",
          "request_id",
          "success"
        ],
        "type": "object",
        "properties": {
          "data": {
            "allOf": [
              {
                "$ref": "#/components/schemas/ArticleSettingsResponse"
              }
            ],
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
      "ArticleSettingsResponse": {
        "type": "object",
        "properties": {
          "slug": {
            "type": "string",
            "description": "The URL slug for the article.",
            "nullable": true,
            "readOnly": true,
            "example": "getting-started-with-single-sign-on"
          },
          "seo_title": {
            "type": "string",
            "description": "The custom SEO title for search engines.",
            "nullable": true,
            "example": "SSO Setup Guide - Product Documentation"
          },
          "description": {
            "type": "string",
            "description": "The meta description for search engines.",
            "nullable": true,
            "example": "Step-by-step instructions for configuring single sign-on with SAML or OIDC providers."
          },
          "allow_comments": {
            "type": "boolean",
            "description": "Whether reader comments are allowed on the article.",
            "example": true
          },
          "show_table_of_contents": {
            "type": "boolean",
            "description": "Whether the table of contents is displayed.",
            "example": true
          },
          "featured_image_url": {
            "type": "string",
            "description": "The URL of the featured image for the article. For private or mixed-visibility projects, a time-limited SAS token is automatically appended. Read-only; the featured image can only be set via the Document360 portal.",
            "nullable": true,
            "example": "https://cdn.example.com/images/sso-hero-banner.png"
          },
          "tags": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "The list of tags associated with the article.",
            "nullable": true
          },
          "status_indicator": {
            "enum": [
              "none",
              "new",
              "updated",
              "custom"
            ],
            "type": "string",
            "allOf": [
              {
                "$ref": "#/components/schemas/ArticleStatusIndicator"
              }
            ],
            "description": "The status indicator badge shown on the article. Possible values: 0 = None, 1 = New, 2 = Updated, 3 = Custom.",
            "x-enumNames": [
              "None",
              "New",
              "Updated",
              "Custom"
            ],
            "x-enum-varnames": [
              "None",
              "New",
              "Updated",
              "Custom"
            ],
            "x-ms-enum": {
              "name": "ArticleStatusIndicator",
              "modelAsString": true
            }
          },
          "status_indicator_expiry_date": {
            "type": "string",
            "description": "The expiry date for the status indicator badge. Only applicable when StatusIndicator is set.",
            "format": "date-time",
            "nullable": true,
            "example": "2025-12-31T23:59:59Z"
          },
          "exclude_from_search": {
            "type": "boolean",
            "description": "Whether the article is excluded from internal search results.",
            "example": false
          },
          "exclude_from_ai_search": {
            "type": "boolean",
            "description": "Whether the article is excluded from AI-powered search.",
            "example": false
          },
          "exclude_from_external_search": {
            "type": "boolean",
            "description": "Whether the article is excluded from external search engine indexing.",
            "example": false
          },
          "related_articles": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/RelatedArticle"
            },
            "description": "The list of related articles linked to this article, returned as enriched objects. When updating via `PATCH`, supply only article IDs as strings.",
            "nullable": true
          },
          "is_acknowledgement_enabled": {
            "type": "boolean",
            "description": "Whether reader acknowledgement is required for this article.",
            "example": false
          },
          "url": {
            "type": "string",
            "description": "The full URL of the article.",
            "format": "uri",
            "nullable": true,
            "example": "https://docs.example.com/en/articles/getting-started-with-single-sign-on"
          }
        },
        "additionalProperties": false,
        "description": "Article settings including SEO and display options."
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
      "ArticleStatusIndicator": {
        "enum": [
          "none",
          "new",
          "updated",
          "custom"
        ],
        "type": "string",
        "description": "The status indicator badge type for an article.",
        "x-enumNames": [
          "None",
          "New",
          "Updated",
          "Custom"
        ],
        "x-enum-varnames": [
          "None",
          "New",
          "Updated",
          "Custom"
        ],
        "x-ms-enum": {
          "name": "ArticleStatusIndicator",
          "modelAsString": true
        }
      },
      "RelatedArticle": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "The unique identifier of the related article.",
            "format": "uuid",
            "nullable": true,
            "readOnly": true,
            "example": "c5d6e7f8-9a0b-1c2d-3e4f-5a6b7c8d9e0f"
          },
          "title": {
            "type": "string",
            "description": "The title of the related article.",
            "nullable": true,
            "example": "Configuring SAML Identity Providers"
          },
          "hidden": {
            "type": "boolean",
            "description": "Whether the related article is hidden from readers.",
            "example": false
          },
          "slug": {
            "type": "string",
            "description": "The URL slug of the related article.",
            "nullable": true,
            "readOnly": true,
            "example": "configuring-saml-identity-providers"
          }
        },
        "additionalProperties": false,
        "description": "A related article linked from another article's settings."
      }
    }
  }
}
````

