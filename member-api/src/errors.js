// Bounded, typed error for the HTTP layer. Every ApiError carries an explicit status/code/message
// that is safe to send to a client as-is — never a raw DB/driver error (docs/phase-5-5/00-member-management-architecture.md
// muc 22 threat #6). Anything that is NOT an ApiError is treated by server.js as an unexpected
// internal error and collapses to a generic 500 with no detail.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
