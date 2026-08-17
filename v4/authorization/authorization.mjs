import { V4_STORES } from '../persistence/schema.mjs';

export async function canUser(persistence, request) {
  const { userId, businessId, permissionCode, operatingUnitId = null } = request;
  if (!userId || !businessId || !permissionCode) return false;

  return persistence.runTransaction(
    [
      V4_STORES.businesses,
      V4_STORES.operatingUnits,
      V4_STORES.businessMemberships,
      V4_STORES.roleAssignments,
      V4_STORES.roles,
      V4_STORES.permissions
    ],
    'readonly',
    async tx => {
      const business = await tx.get(V4_STORES.businesses, businessId);
      if (!business) return false;

      if (operatingUnitId) {
        const unit = await tx.get(V4_STORES.operatingUnits, operatingUnitId);
        if (!unit || unit.businessId !== businessId) return false;
      }

      const membership = await tx.getByIndex(
        V4_STORES.businessMemberships,
        'byUserAndBusiness',
        [userId, businessId]
      );
      if (!membership || membership.status !== 'active') return false;

      const permission = await tx.get(V4_STORES.permissions, permissionCode);
      if (!permission || permission.status !== 'active') return false;

      const assignments = await tx.getAllByIndex(
        V4_STORES.roleAssignments,
        'byMembershipId',
        membership.id
      );

      for (const assignment of assignments) {
        if (assignment.status !== 'active' || assignment.businessId !== businessId) continue;
        const inScope = assignment.scopeType === 'business' || (
          operatingUnitId &&
          assignment.scopeType === 'operating_units' &&
          assignment.operatingUnitIds.includes(operatingUnitId)
        );
        if (!inScope) continue;
        const role = await tx.get(V4_STORES.roles, assignment.roleId);
        if (
          role?.status === 'active' &&
          role.businessId === businessId &&
          role.permissionCodes.includes(permissionCode)
        ) return true;
      }
      return false;
    }
  );
}
