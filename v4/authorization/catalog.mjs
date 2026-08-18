export const PERMISSION_CATALOG = Object.freeze([
  ['sales.create', 'sales', 'Create sales'],
  ['sales.view', 'sales', 'View sales'],
  ['sales.cancel', 'sales', 'Cancel sales'],
  ['sales.fulfill', 'sales', 'Fulfil sales'],
  ['sales.credit', 'sales', 'Grant Customer credit'],
  ['sales.discount', 'sales', 'Apply sales discounts'],
  ['sales.return', 'sales', 'Return sold goods'],
  ['sales.refund', 'sales', 'Refund sales'],
  ['payments.create', 'payments', 'Record payments'],
  ['payments.cancel', 'payments', 'Cancel payments'],
  ['payments.view', 'payments', 'View payments'],
  ['customers.create', 'customers', 'Create customers'],
  ['customers.edit', 'customers', 'Edit customers'],
  ['customers.view', 'customers', 'View customers'],
  ['customers.manage', 'customers', 'Manage customers'],
  ['receivables.view', 'receivables', 'View receivables'],
  ['customer_payments.view', 'customer_payments', 'View Customer payments'],
  ['customer_payments.record', 'customer_payments', 'Record Customer payments'],
  ['customer_payments.reverse', 'customer_payments', 'Reverse Customer payments'],
  ['inventory.view', 'inventory', 'View inventory'],
  ['inventory.adjust', 'inventory', 'Adjust inventory'],
  ['inventory.transfer', 'inventory', 'Transfer inventory'],
  ['inventory.receive', 'inventory', 'Receive inventory'],
  ['purchases.create', 'purchases', 'Create purchases'],
  ['purchases.receive', 'purchases', 'Receive purchases'],
  ['purchases.approve', 'purchases', 'Approve purchases'],
  ['purchases.return', 'purchases', 'Return purchases'],
  ['suppliers.view', 'suppliers', 'View suppliers'],
  ['suppliers.manage', 'suppliers', 'Manage suppliers'],
  ['supplier_payments.view', 'supplier_payments', 'View supplier payments'],
  ['supplier_payments.record', 'supplier_payments', 'Record supplier payments'],
  ['finance.view', 'finance', 'View finance'],
  ['finance.post', 'finance', 'Post financial entries'],
  ['finance.adjust', 'finance', 'Adjust financial entries'],
  ['finance.accounts.view', 'finance', 'View ledger and financial accounts'],
  ['finance.accounts.manage', 'finance', 'Manage ledger and financial accounts'],
  ['finance.journal.view', 'finance', 'View Journal Entries'],
  ['finance.journal.create', 'finance', 'Create Manual Journals'],
  ['finance.journal.post', 'finance', 'Post Journal Entries'],
  ['finance.journal.reverse', 'finance', 'Reverse posted Journal Entries'],
  ['finance.expenses.view', 'finance', 'View Expenses'],
  ['finance.expenses.record', 'finance', 'Record Expenses'],
  ['finance.cash_transfer', 'finance', 'Transfer cash or bank funds'],
  ['finance.capital.record', 'finance', 'Record capital contributions'],
  ['finance.drawings.record', 'finance', 'Record Owner Drawings'],
  ['finance.period.close', 'finance', 'Close accounting periods'],
  ['finance.period.reopen', 'finance', 'Reopen accounting periods'],
  ['finance.reports.view', 'finance', 'View Finance reports'],
  ['finance.opening_balance', 'finance', 'Post opening balances'],
  ['reports.view', 'reports', 'View reports'],
  ['documents.issue', 'documents', 'Issue documents'],
  ['documents.share', 'documents', 'Share documents'],
  ['staff.manage', 'staff', 'Manage staff and access'],
  ['approvals.review', 'approvals', 'Review approvals'],
  ['settings.manage', 'settings', 'Manage business settings']
  ,['migration.view', 'migration', 'View migration evidence']
  ,['migration.preview', 'migration', 'Preview migration']
  ,['migration.backup', 'migration', 'Export migration backup']
  ,['migration.execute', 'migration', 'Execute controlled migration']
  ,['migration.reconcile', 'migration', 'Reconcile migration']
  ,['migration.accept', 'migration', 'Accept reconciled migration']
  ,['migration.cutover', 'migration', 'Complete controlled cutover']
  ,['migration.rollback', 'migration', 'Record pre-native-operation rollback']
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
      'sales.create', 'sales.view', 'sales.fulfill', 'payments.create', 'payments.view',
      'customer_payments.record', 'customer_payments.view',
      'customers.create', 'customers.view', 'inventory.view', 'documents.issue'
    ]
  },
  {
    code: 'accountant',
    name: 'Accountant',
    permissionCodes: [
      'sales.view', 'payments.view', 'customer_payments.view', 'receivables.view', 'customers.view', 'purchases.create',
      'purchases.receive', 'finance.view', 'finance.post', 'reports.view',
      'documents.issue', 'approvals.review'
    ]
  },
  {
    code: 'inventory_storekeeper',
    name: 'Inventory / Storekeeper',
    permissionCodes: [
      'inventory.view', 'inventory.adjust', 'inventory.transfer',
      'inventory.receive', 'purchases.create', 'purchases.receive', 'sales.view', 'sales.fulfill'
    ]
  },
  { code: 'viewer', name: 'Viewer', permissionCodes: VIEW_ONLY }
].map(role => Object.freeze({ ...role, permissionCodes: Object.freeze(role.permissionCodes) })));

export const PERMISSION_CODES = Object.freeze(ALL);
export const PERMISSION_CATALOG_VERSION = 6;
export const SYSTEM_ROLE_TEMPLATE_VERSION = 6;
