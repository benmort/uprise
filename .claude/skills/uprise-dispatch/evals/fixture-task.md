# Fixture task description (frozen input)

This is the raw task description handed to the `uprise-dispatch` skill. It is a paragraph of intent, not a tracker item. The skill must turn it into a dispatch brief + a worktree.

---

We need a way for an organiser to put a contact on hold. Add a `HOLD` status to the contact lifecycle so a contact can move `ACTIVE → HOLD` and back `HOLD → ACTIVE`, but never `ARCHIVED → HOLD`. When a contact goes on hold we want a `contact.held` domain event so downstream reactions (e.g. pausing the contact's scheduled messages) can react. The transition needs a new endpoint `POST /contacts/:id/hold` that only users with the contacts-manage permission can call. Make sure the existing contact suppression rules still apply. Out of scope: anything that actually pauses the scheduled messages – that's a separate reaction we'll build later.
