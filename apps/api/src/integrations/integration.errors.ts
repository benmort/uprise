import { ApiHttpException } from "../common/http/api-response";

export class IntegrationConnectionError extends ApiHttpException {
  constructor(message = "Unable to connect to integration provider", details?: unknown) {
    super("INTEGRATION_CONNECTION_FAILED", message, 502, details);
  }
}

export class IntegrationAuthError extends ApiHttpException {
  constructor(message = "Integration authentication failed", details?: unknown) {
    super("INTEGRATION_AUTH_FAILED", message, 401, details);
  }
}

export class IntegrationValidationError extends ApiHttpException {
  constructor(message = "Integration request validation failed", details?: unknown) {
    super("INTEGRATION_VALIDATION_FAILED", message, 400, details);
  }
}
