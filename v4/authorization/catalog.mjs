export const PERMISSION_CATALOG = Object.freeze([
  ['sales.create', 'sales', 'Create sales'],
  ['sales.view', 'sales', 'View sales'],
  ['sales.cancel', 'sales', 'Cancel sales'],
  ['sales.refund', 'sales', 'Refund sales'],
  ['payments.create', 'payments', 'Record payments'],
  ['payments.cancel', 'payments', 'Cancel payments'],
  ['payments.view', 'payments', 'View payments'],
  ['customers.create', 'customers', 'Create customers'],
  ['customers.edit', 'customers', 'Edit customers'],
  ['customers.view', 'customers', 'View customers'],
  ['inventory.view', 'inventory', 'View inventory'],
  ['inventory.adjust', 'inventory', 'Adjust inventory'],
  ['inventory.transfer', 'inventory', 'Transfer inventory'],
  ['inventory.receive', 'inventory', 'Receive inventory'],
  ['purchases.create', 'purchases', 'Create purchases'],
  ['purchases.receive', 'purchases', 'Receive purchases'],
  ['purchases.approve', 'purchases', 'Approve purchases'],
  ['finance.view', 'finance', 'View finance'],
  ['finance.post', 'finance', 'Post financial entries'],
  ['finance.adjust', 'finance', 'Adjust financial entries'],
  ['reports.view', 'reports', 'View reports'],
  ['documents.issue', 'documents', 'Issue documents'],
  ['documents.share', 'documents', 'Share documents'],
  ['staff.manage', 'staff', 'Manage staff and access'],
  ['approvals.review', 'approvals', 'Review approvals'],
  ['settings.manage', 'settings', 'Manage business settings']
].map(([code, module, description]) => Object.freeze({ code, module, description })));

const ALL = PERMISSION_CATALOG.map(permission => permission.code);
const VIEW_ONLY = ALL.filter(code => code.endsWith('.view'));

export const SYSTEM_ROLE_DEFINITIONS = Object.freeze([
  { code: 'owner', name: 'Owner', permissionCodes: ALL },
  { code: 'administrator', name: 'Administrator', permissionCodes: ALL },
  {
    code: 'manager',
    name: 'Manager',
    permissionCodes: ALL.filter(code => !['finance.post', 'finance.adjust', 'settings.manage'].includes(code))
  },
  {
    code: 'cashier',
    name: 'Cashier',
    permissionCodes: [
      'sales.create', 'sales.view', 'payments.create', 'payments.view',
      'customers.create', 'customers.view', 'inventory.view', 'documents.issue'
    ]
  },
  {
    code: 'accountant',
    name: 'Accountant',
    permissionCodes: [
      'sales.view', 'payments.view', 'customers.view', 'purchases.create',
      'purchases.receive', 'finance.view', 'finance.post', 'reports.view',
      'documents.issue', 'approvals.review'
    ]
  },
  {
    code: 'inventory_storekeeper',
    name: 'Inventory / Storekeeper',
    permissionCodes: [
      'inventory.view', 'inventory.adjust', 'inventory.transfer',
      'inventory.receive', 'purchases.create', 'purchases.receive', 'sales.view'
    ]
  },
  { code: 'viewer', name: 'Viewer', permissionCodes: VIEW_ONLY }
].map(role => Object.freeze({ ...role, permissionCodes: Object.freeze(role.permissionCodes) })));

export const PERMISSION_CODES = Object.freeze(ALL);
export const PERMISSION_CATALOG_VERSION = 2;
export const SYSTEM_ROLE_TEMPLATE_VERSION = 2;
