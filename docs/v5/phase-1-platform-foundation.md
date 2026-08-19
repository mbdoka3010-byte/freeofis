# Free Ofis V5 Phase 1 platform foundation

V5 is a fresh platform with the independent IndexedDB database `freeofis_v5`. It does not read or import V3 or V4 operational storage.

## Core boundaries

- A user is one durable identity and may own a personal environment and multiple organisation memberships.
- Organisations are generic institutions. Organisational units form one parent-child hierarchy for branches, departments, teams and related structures.
- Memberships connect users to organisations. Role assignments independently provide organisation-wide or unit-scoped permissions.
- Authorisation is deny-by-default and evaluates active user, organisation, membership, role, permission and unit scope by ID.
- Personal ownership is checked directly against the user ID and is never inherited through an organisation role.
- Workspace definitions are registered once. Workspace instances use shared ownership and scope metadata for personal or organisation contexts.
- Activity events support useful product history. Audit events record privileged accountability actions without record content or secrets.
- Browser sessions return a random secret once and persist only its SHA-256 digest and expiry metadata.

## Standard workspace registry

Phase 1 registers My Office, My Business, My School, My Studio and My Space. Organisation-authorised custom definitions use the same workspace-instance infrastructure.

## Extension convention

Future scoped records should use the shared ownership convention: `ownerType`, `ownerId`, optional `organisationId`, optional `unitId`, optional `workspaceId`, creator ID, timestamps and security metadata.

Phase 1 intentionally does not implement the feature depth of the individual workspaces.
