# Get an article by ID.

> Returns the latest version of the article (draft or published). To retrieve a specific version,
use `GET /v3/projects/{projectId}/articles/{articleId}/versions/{versionNumber}` instead.
The response includes both raw content and rendered HTML.
For private or mixed-visibility projects, SAS tokens are appended to media URLs in the content by default.

## OpenAPI

````json GET /v3/projects/{project_id}/articles/{article_id}
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
      "get": {
        "tags": [
          "Articles"
        ],
        "summary": "Get an article by ID.",
        "description": "Returns the latest version of the article (draft or published). To retrieve a specific version,\r\nuse `GET /v3/projects/{projectId}/articles/{articleId}/versions/{versionNumber}` instead.\r\nThe response includes both raw content and rendered HTML.\r\nFor private or mixed-visibility projects, SAS tokens are appended to media URLs in the content by default.",
        "operationId": "getArticleArticle",
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
            "name": "content_mode",
            "in": "query",
            "description": "Controls content processing. Use `raw` (default) for unprocessed content with SAS tokens appended for private/mixed projects. Use `display` for fully rendered content with Snippets, Variables, and Glossaries resolved, SAS tokens appended, and internal notes removed. Warning: do not use display content for updates — Snippets, Variables, and Glossaries are resolved into inline HTML and the reusable component references will be lost.",
            "schema": {
              "enum": [
                "raw",
                "display"
              ],
              "type": "string",
              "allOf": [
                {
                  "$ref": "#/components/schemas/ContentMode"
                }
              ],
              "description": "Controls how article/category content is processed in the response.",
              "default": "raw",
              "x-enumNames": [
                "Raw",
                "Display"
              ],
              "x-enum-varnames": [
                "Raw",
                "Display"
              ],
              "x-ms-enum": {
                "name": "ContentMode",
                "modelAsString": true
              }
            }
          },
          {
            "name": "published",
            "in": "query",
            "description": "When true, returns the latest published version. When false (default), returns the latest version including drafts.",
            "schema": {
              "type": "boolean",
              "default": false
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Article found and returned successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ArticleDetailResponseApiResponse"
                },
                "examples": {
                  "Article retrieved successfully": {
                    "summary": "Returns the latest version of the article with full content, authors, and available languages.",
                    "value": {
                      "data": {
                        "id": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
                        "title": "Getting Started with Single Sign-On",
                        "content": "# Introduction\nThis guide walks you through configuring SSO for your organization.\n\n## Prerequisites\n- An active Document360 project\n- Admin access to your identity provider",
                        "html_content": "<h1>Introduction</h1><p>This guide walks you through configuring SSO for your organization.</p><h2>Prerequisites</h2><ul><li>An active Document360 project</li><li>Admin access to your identity provider</li></ul>",
                        "category_id": "f4a5b6c7-d8e9-0a1b-2c3d-4e5f6a7b8c9d",
                        "project_version_id": "1c2d3e4f-5a6b-7c8d-9e0f-a1b2c3d4e5f6",
                        "version_number": 3,
                        "public_version": 2,
                        "latest_version": 3,
                        "enable_rtl": false,
                        "hidden": false,
                        "status": 0,
                        "order": 0,
                        "created_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                        "authors": [
                          {
                            "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                            "first_name": "Jane",
                            "last_name": "Doe",
                            "email": "jane.doe@example.com",
                            "profile_logo_url": "https://cdn.example.com/avatars/jane-doe.png"
                          }
                        ],
                        "created_at": "2025-06-01T09:00:00Z",
                        "modified_at": "2025-08-15T14:30:00Z",
                        "modified_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                        "slug": "getting-started-with-single-sign-on",
                        "is_fallback_content": false,
                        "description": "Learn how to configure single sign-on authentication for your knowledge base.",
                        "category_type": 0,
                        "content_type": 0,
                        "is_shared_article": false,
                        "translation_option": "none",
                        "url": "https://docs.example.com/en/articles/getting-started-with-single-sign-on",
                        "current_workflow_status_id": "b7e2a1d4-3f56-4c89-9d0e-1a2b3c4d5e6f",
                        "lang_code": "en",
                        "available_languages": [
                          {
                            "lang_code": "fr",
                            "url": "https://docs.example.com/fr/articles/getting-started-with-single-sign-on",
                            "translation_status": "translated"
                          }
                        ],
                        "settings": {
                          "seo_title": "SSO Setup Guide - Product Documentation",
                          "description": "Step-by-step instructions for configuring single sign-on with SAML or OIDC providers.",
                          "exclude_from_external_search": false
                        }
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
          "403": {
            "description": "User does not have access to this project.",
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
            "description": "Article with the specified ID was not found.",
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
      "ContentMode": {
        "enum": [
          "raw",
          "display"
        ],
        "type": "string",
        "description": "Controls how article/category content is processed in the response.",
        "x-enumNames": [
          "Raw",
          "Display"
        ],
        "x-enum-varnames": [
          "Raw",
          "Display"
        ],
        "x-ms-enum": {
          "name": "ContentMode",
          "modelAsString": true
        }
      },
      "ArticleDetailResponseApiResponse": {
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
                "$ref": "#/components/schemas/ArticleDetailResponse"
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
      "ArticleDetailResponse": {
        "required": [
          "id",
          "status",
          "title"
        ],
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "The unique identifier of the article.",
            "format": "uuid",
            "nullable": true,
            "readOnly": true,
            "example": "9a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d"
          },
          "title": {
            "type": "string",
            "description": "The title of the article.",
            "nullable": true,
            "example": "Getting Started with Single Sign-On"
          },
          "content": {
            "type": "string",
            "description": "The raw content of the article in its source format.",
            "nullable": true,
            "example": "# Introduction\nThis guide walks you through configuring SSO for your organization."
          },
          "html_content": {
            "type": "string",
            "description": "The rendered HTML content of the article.",
            "nullable": true,
            "example": "<h1>Introduction</h1><p>This guide walks you through configuring SSO.</p>"
          },
          "category_id": {
            "type": "string",
            "description": "The identifier of the category this article belongs to. Use this value with `GET /v3/projects/{projectId}/categories/{categoryId}` to retrieve category details.",
            "nullable": true,
            "example": "f4a5b6c7-d8e9-0a1b-2c3d-4e5f6a7b8c9d"
          },
          "project_version_id": {
            "type": "string",
            "description": "The project version this article belongs to. Corresponds to a version from `GET /v3/projects/{projectId}/project-versions`.",
            "nullable": true,
            "example": "1c2d3e4f-5a6b-7c8d-9e0f-a1b2c3d4e5f6"
          },
          "version_number": {
            "type": "integer",
            "description": "The current version number of the article.",
            "format": "int32",
            "example": 3
          },
          "public_version": {
            "type": "integer",
            "description": "The latest published version number, or null if the article has never been published.",
            "format": "int32",
            "nullable": true,
            "readOnly": true,
            "example": 2
          },
          "latest_version": {
            "type": "integer",
            "description": "The latest version number including drafts.",
            "format": "int32",
            "readOnly": true,
            "example": 3
          },
          "enable_rtl": {
            "type": "boolean",
            "description": "Whether right-to-left text direction is enabled.",
            "example": false
          },
          "hidden": {
            "type": "boolean",
            "description": "Whether the article is hidden from readers.",
            "example": false
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
            "description": "The publication status of the article. Possible values: 0 = Draft, 3 = Published.",
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
          "order": {
            "type": "integer",
            "description": "The display order of the article within its category.",
            "format": "int32",
            "example": 5
          },
          "created_by": {
            "type": "string",
            "description": "The user ID of the original article creator. For full author details including name and avatar, see the `authors` array. Corresponds to a user from `GET /v3/projects/{projectId}/users`.",
            "nullable": true,
            "example": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
          },
          "authors": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AuthorResponse"
            },
            "description": "The list of contributors to this article, including the original creator and any subsequent editors.",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "description": "The date and time the article was created.",
            "format": "date-time",
            "readOnly": true,
            "example": "2025-06-01T09:00:00Z"
          },
          "modified_at": {
            "type": "string",
            "description": "The date and time the article was last modified.",
            "format": "date-time",
            "readOnly": true,
            "example": "2025-08-15T14:30:00Z"
          },
          "modified_by": {
            "type": "string",
            "description": "The user ID of who last modified this article. Corresponds to a user from `GET /v3/projects/{projectId}/users`.",
            "nullable": true,
            "example": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e"
          },
          "slug": {
            "type": "string",
            "description": "The URL slug for the article.",
            "nullable": true,
            "readOnly": true,
            "example": "getting-started-with-single-sign-on"
          },
          "is_fallback_content": {
            "type": "boolean",
            "description": "Whether the content is a fallback from the default language.",
            "example": false
          },
          "description": {
            "type": "string",
            "description": "A brief description of the article.",
            "nullable": true,
            "example": "Learn how to configure single sign-on authentication for your knowledge base."
          },
          "category_type": {
            "allOf": [
              {
                "$ref": "#/components/schemas/CategoryType"
              }
            ],
            "description": "The type of category this article belongs to. Possible values: 0 = Folder, 1 = Page, 2 = Index.",
            "nullable": true
          },
          "content_type": {
            "allOf": [
              {
                "$ref": "#/components/schemas/ContentType"
              }
            ],
            "description": "The editor content type of the article. Possible values: 0 = Markdown, 1 = Wysiwyg (rich text), 2 = Block.",
            "nullable": true
          },
          "is_shared_article": {
            "type": "boolean",
            "description": "Whether the article is shared across multiple projects.",
            "example": false
          },
          "translation_option": {
            "enum": [
              "none",
              "needTranslation",
              "translated",
              "inProgress"
            ],
            "type": "string",
            "allOf": [
              {
                "$ref": "#/components/schemas/TranslationOption"
              }
            ],
            "description": "The translation status of the article. Possible values: 0 = None, 1 = NeedTranslation, 2 = Translated, 3 = InProgress.",
            "x-enumNames": [
              "None",
              "NeedTranslation",
              "Translated",
              "InProgress"
            ],
            "x-enum-varnames": [
              "None",
              "NeedTranslation",
              "Translated",
              "InProgress"
            ],
            "x-ms-enum": {
              "name": "TranslationOption",
              "modelAsString": true
            }
          },
          "url": {
            "type": "string",
            "description": "The full URL of the article.",
            "format": "uri",
            "nullable": true,
            "example": "https://docs.example.com/en/articles/getting-started-with-single-sign-on"
          },
          "current_workflow_status_id": {
            "type": "string",
            "description": "The current workflow status identifier. Retrieve available statuses from `GET /v3/projects/{projectId}/workflow-statuses`.",
            "nullable": true,
            "example": "b7e2a1d4-3f56-4c89-9d0e-1a2b3c4d5e6f"
          },
          "lang_code": {
            "type": "string",
            "description": "The language code of this article version.",
            "nullable": true,
            "example": "en"
          },
          "available_languages": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AvailableLanguage"
            },
            "description": "The list of languages this article is available in.",
            "nullable": true
          },
          "settings": {
            "allOf": [
              {
                "$ref": "#/components/schemas/ArticleDocumentSettings"
              }
            ],
            "description": "A subset of article settings (SEO title, description, external search exclusion). For full settings including tags, related articles, and display options, use `GET /v3/projects/{projectId}/articles/{articleId}/settings`.",
            "nullable": true
          }
        },
        "additionalProperties": false,
        "description": "Full article detail with content."
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
      },
      "AuthorResponse": {
        "required": [
          "email",
          "id"
        ],
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "The unique identifier of the author.",
            "format": "uuid",
            "nullable": true,
            "readOnly": true,
            "example": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
          },
          "first_name": {
            "type": "string",
            "description": "The first name of the author.",
            "nullable": true,
            "example": "Jane"
          },
          "last_name": {
            "type": "string",
            "description": "The last name of the author.",
            "nullable": true,
            "example": "Doe"
          },
          "email": {
            "type": "string",
            "description": "The email address of the author.",
            "format": "email",
            "nullable": true,
            "example": "jane.doe@example.com"
          },
          "profile_logo_url": {
            "type": "string",
            "description": "The URL of the author's profile image.",
            "nullable": true,
            "example": "https://cdn.example.com/avatars/jane-doe.png"
          }
        },
        "additionalProperties": false,
        "description": "Author information for an article."
      },
      "CategoryType": {
        "enum": [
          "folder",
          "page",
          "index"
        ],
        "type": "string",
        "description": "The type of category an article belongs to.",
        "x-enumNames": [
          "Folder",
          "Page",
          "Index"
        ],
        "x-enum-varnames": [
          "Folder",
          "Page",
          "Index"
        ],
        "x-ms-enum": {
          "name": "CategoryType",
          "modelAsString": true
        }
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
      },
      "TranslationOption": {
        "enum": [
          "none",
          "needTranslation",
          "translated",
          "inProgress"
        ],
        "type": "string",
        "description": "The translation status of an article.",
        "x-enumNames": [
          "None",
          "NeedTranslation",
          "Translated",
          "InProgress"
        ],
        "x-enum-varnames": [
          "None",
          "NeedTranslation",
          "Translated",
          "InProgress"
        ],
        "x-ms-enum": {
          "name": "TranslationOption",
          "modelAsString": true
        }
      },
      "AvailableLanguage": {
        "type": "object",
        "properties": {
          "lang_code": {
            "type": "string",
            "description": "The language code (e.g., \"en\", \"fr\").",
            "nullable": true,
            "example": "fr"
          },
          "url": {
            "type": "string",
            "description": "The URL of the article in this language.",
            "format": "uri",
            "nullable": true,
            "example": "https://docs.example.com/fr/articles/getting-started-with-single-sign-on"
          },
          "translation_status": {
            "enum": [
              "none",
              "needTranslation",
              "translated",
              "inProgress"
            ],
            "type": "string",
            "allOf": [
              {
                "$ref": "#/components/schemas/TranslationOption"
              }
            ],
            "description": "The translation status for this language. Possible values: 0 = None, 1 = NeedTranslation, 2 = Translated, 3 = InProgress.",
            "x-enumNames": [
              "None",
              "NeedTranslation",
              "Translated",
              "InProgress"
            ],
            "x-enum-varnames": [
              "None",
              "NeedTranslation",
              "Translated",
              "InProgress"
            ],
            "x-ms-enum": {
              "name": "TranslationOption",
              "modelAsString": true
            }
          }
        },
        "additionalProperties": false,
        "description": "Represents a language in which an article is available."
      },
      "ArticleDocumentSettings": {
        "type": "object",
        "properties": {
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
          "exclude_from_external_search": {
            "type": "boolean",
            "description": "Whether the article is excluded from external search engine indexing.",
            "example": false
          }
        },
        "additionalProperties": false,
        "description": "SEO and display settings embedded within an article detail."
      }
    }
  }
}
````

