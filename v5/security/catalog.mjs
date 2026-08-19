export const PERMISSIONS = Object.freeze([
  ['organisation.view', 'View organisation'], ['organisation.manage', 'Manage organisation'], ['units.view', 'View organisational units'], ['units.manage', 'Manage organisational units'],
  ['memberships.view', 'View memberships'], ['memberships.manage', 'Manage memberships and roles'], ['workspaces.view', 'View enabled workspaces'], ['workspaces.activate', 'Activate workspaces'],
  ['workspaces.register_custom', 'Register custom workspace types'], ['audit.view', 'View security audit'],
  ['office.view','View My Office'],['office.work','Create and update office work'],['office.correspondence','Manage correspondence'],['office.meetings','Manage meetings'],['office.records','Manage office records'],['office.confidential.view','View confidential office material']
].map(([code, description]) => Object.freeze({ code, description })));
const ALL = PERMISSIONS.map(item => item.code);
export const ROLE_TEMPLATES = Object.freeze([
  { code: 'owner', name: 'Owner', permissionCodes: ALL },
  { code: 'admin', name: 'Admin', permissionCodes: ALL },
  { code: 'manager', name: 'Manager', permissionCodes: ['organisation.view', 'units.view', 'units.manage', 'memberships.view', 'workspaces.view', 'workspaces.activate','office.view','office.work','office.correspondence','office.meetings','office.records','office.confidential.view'] },
  { code: 'member', name: 'Member', permissionCodes: ['organisation.view', 'units.view', 'workspaces.view','office.view','office.work'] }
].map(item => Object.freeze({ ...item, permissionCodes: Object.freeze(item.permissionCodes) })));
export const STANDARD_WORKSPACES = Object.freeze([
  ['office', 'office', 'My Office'], ['business', 'business', 'My Business'], ['school', 'school', 'My School'], ['studio', 'studio', 'My Studio'], ['space', 'space', 'My Space']
].map(([code, type, name]) => Object.freeze({ code, type, name })));
