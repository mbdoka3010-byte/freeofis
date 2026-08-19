export const PERMISSIONS = Object.freeze([
  ['organisation.view', 'View organisation'], ['organisation.manage', 'Manage organisation'], ['units.view', 'View organisational units'], ['units.manage', 'Manage organisational units'],
  ['memberships.view', 'View memberships'], ['memberships.manage', 'Manage memberships and roles'], ['workspaces.view', 'View enabled workspaces'], ['workspaces.activate', 'Activate workspaces'],
  ['workspaces.register_custom', 'Register custom workspace types'], ['audit.view', 'View security audit'],
  ['office.view','View My Office'],['office.work','Create and update office work'],['office.correspondence','Manage correspondence'],['office.meetings','Manage meetings'],['office.records','Manage office records'],['office.confidential.view','View confidential office material'],['school.view','View My School'],['school.learn','Use student learning tools'],['school.teach','Manage courses and teaching'],['school.results','Manage and release results'],['school.fees','Manage fee obligations and payments'],['studio.view','View My Studio'],['studio.work','Create and update Studio work'],['studio.confidential.view','View confidential Studio material']
].map(([code, description]) => Object.freeze({ code, description })));
const ALL = PERMISSIONS.map(item => item.code);
export const ROLE_TEMPLATES = Object.freeze([
  { code: 'owner', name: 'Owner', permissionCodes: ALL },
  { code: 'admin', name: 'Admin', permissionCodes: ALL },
  { code: 'manager', name: 'Manager', permissionCodes: ['organisation.view', 'units.view', 'units.manage', 'memberships.view', 'workspaces.view', 'workspaces.activate','office.view','office.work','office.correspondence','office.meetings','office.records','office.confidential.view','school.view','school.learn','school.teach','school.results','school.fees','studio.view','studio.work','studio.confidential.view'] },
  { code: 'member', name: 'Member', permissionCodes: ['organisation.view', 'units.view', 'workspaces.view','office.view','office.work','school.view','school.learn','studio.view','studio.work'] }
].map(item => Object.freeze({ ...item, permissionCodes: Object.freeze(item.permissionCodes) })));
export const STANDARD_WORKSPACES = Object.freeze([
  ['office', 'office', 'My Office'], ['business', 'business', 'My Business'], ['school', 'school', 'My School'], ['studio', 'studio', 'My Studio'], ['space', 'space', 'My Space']
].map(([code, type, name]) => Object.freeze({ code, type, name })));
