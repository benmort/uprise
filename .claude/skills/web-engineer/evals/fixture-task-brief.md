# Task brief (frozen eval input)

Add a settings page to the organiser shell that lists the tenant's saved payment methods.

- Route: a new page under the `(main)` settings area, e.g. `/settings/payment-methods`.
- It fetches the tenant's payment methods from the API and shows them in a list (brand, last-4, expiry).
- Only billing-capable organisers should see it; a canvasser or an organiser without billing permission must not reach a dead control.
- A "Remove" action sits on each row; while a removal is in flight the button must stay visible but unusable.

Plan the frontend work: name the invariants in scope, the guides to read, and how each part is built. Do not write the backend.
