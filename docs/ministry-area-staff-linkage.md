# Staff Ministry Area linkage

Admin Staff create and update contracts accept optional `ministryAreaId`.
Use an opaque ID from `GET /api/ministry-areas`; the backend rejects an
unknown ID (404), an inactive area (409), or a blank string (400). Omit the
field to preserve the existing link, or PATCH with JSON `null` to clear it.
Only new assignments are validated; renaming or deactivating a Ministry Area
retains historical Staff references. Existing Staff without a link read as
`ministryAreaId: null`. Invitation flows also read as unlinked until an
administrator assigns an area.

The Staff event stream stores the ID in creation/update events; deterministic
replay exposes the current ID through Staff directory reads. The Staff audit
records link changes with actor and timestamp. The admin authentication and
audit rules for Staff writes remain in force. A deactivation combined with a
link change is rejected: perform separate commands if both are needed.

This field describes a Staff member's primary Ministry Area. It does not
change ministry roles, permissions, assignment availability, or dashboard
behavior. No Ministry Areas or Staff assignments are seeded.
