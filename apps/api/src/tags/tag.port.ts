// Port so other domains (journeys, engagement) can apply a contact tag without a
// hard dependency on the tags module — mirrors JOURNEY_TRIGGER_PORT. Injected
// @Optional so those modules boot even if tags isn't wired.
export const CONTACT_TAG_PORT = Symbol("CONTACT_TAG_PORT");

export interface ContactTagPort {
  /** Ensure a tag with `key` exists for the tenant, then assign it to the contact
   *  (idempotent). Emits contacts.tag.added when a new assignment is created. */
  applyTag(tenantId: string, contactId: string, key: string, source?: string): Promise<void>;
}
