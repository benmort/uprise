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

/**
 * The tenant has no usable connection for the requested provider. 409 rather than 404:
 * the route exists and the caller is authorised, the tenant just hasn't connected an
 * account yet. Nothing auto-creates one — connecting is always an explicit act.
 */
export class IntegrationNotConnectedError extends ApiHttpException {
  constructor(message = "No integration connection is configured for this organisation", details?: unknown) {
    super("INTEGRATION_NOT_CONNECTED", message, 409, details);
  }
}
