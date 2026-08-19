import { V5_STORES } from '../persistence/schema.mjs';

async function unitWithin(tx, organisationId, requestedUnitId, assignedIds) {
  let current = requestedUnitId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    if (assignedIds.includes(current)) return true;
    visited.add(current);
    const unit = await tx.get(V5_STORES.organisationUnits, current);
    if (!unit || unit.organisationId !== organisationId || unit.status !== 'active') return false;
    current = unit.parentUnitId;
  }
  return false;
}

export async function can(persistence, request = {}) {
  const { userId, organisationId, permissionCode, unitId = null } = request;
  if (!userId || !organisationId || !permissionCode) return false;
  return persistence.runTransaction([V5_STORES.users, V5_STORES.organisations, V5_STORES.organisationUnits, V5_STORES.memberships, V5_STORES.roleAssignments, V5_STORES.roles], 'readonly', async tx => {
    const user = await tx.get(V5_STORES.users, userId), organisation = await tx.get(V5_STORES.organisations, organisationId);
    if (!user || user.status !== 'active' || !organisation || organisation.status !== 'active') return false;
    if (unitId) { const unit = await tx.get(V5_STORES.organisationUnits, unitId); if (!unit || unit.organisationId !== organisationId || unit.status !== 'active') return false; }
    const membership = await tx.getByIndex(V5_STORES.memberships, 'byUserAndOrganisation', [userId, organisationId]);
    if (!membership || membership.status !== 'active') return false;
    const assignments = await tx.getAllByIndex(V5_STORES.roleAssignments, 'byMembershipId', membership.id);
    for (const assignment of assignments) {
      if (assignment.status !== 'active' || assignment.organisationId !== organisationId) continue;
      const role = await tx.get(V5_STORES.roles, assignment.roleId);
      if (!role || role.status !== 'active' || role.organisationId !== organisationId || !role.permissionCodes.includes(permissionCode)) continue;
      if (assignment.scopeType === 'organisation') return true;
      if (unitId && assignment.scopeType === 'units' && await unitWithin(tx, organisationId, unitId, assignment.unitIds)) return true;
    }
    return false;
  });
}

export async function canAccessOwnership(persistence, request = {}) {
  if (!request.userId || !request.ownerType || !request.ownerId) return false;
  if (request.ownerType === 'personal') return request.ownerId === request.userId;
  if (request.ownerType !== 'organisation' || request.ownerId !== request.organisationId) return false;
  return can(persistence, { userId: request.userId, organisationId: request.organisationId, unitId: request.unitId || null, permissionCode: request.permissionCode || 'workspaces.view' });
}
