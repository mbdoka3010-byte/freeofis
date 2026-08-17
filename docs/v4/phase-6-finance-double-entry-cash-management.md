# V4 Phase 6 — Finance, Double-Entry Accounting and Cash Management

Phase 6 is an isolated Finance foundation. It consumes committed Phase 3–5 operational evidence by reference and never rewrites Sales, Procurement, Inventory, V3 records, or production storage.

## Persistence and ledger contract

IndexedDB advances additively to version 6. All 47 Phase 5 stores remain intact. Eleven stores are added: `ledgerAccounts`, `accountMappings`, `journalEntries`, `journalEntryLines`, `financialAccounts`, `financeTransactions`, `expensesV4`, `accountingPeriods`, `openingBalanceBatches`, `financePostingCheckpoints`, and `financePostingFailures`—58 stores total.

The Chart of Accounts is Business-scoped and hierarchical. Accounts carry stable semantic `systemRole` identities independently of editable codes/names. Summary accounts are non-posting; cross-Business parents, invalid posting accounts and canonical-role duplication are rejected. Customers, Suppliers, Products, Operating Units and InventoryLocations remain analytical dimensions rather than separate GL accounts.

Posted Journal Entries are balanced per currency in integer minor units and immutable through the Finance service. Drafts do not affect reports. Reversal creates a new, mirrored posted Journal and preserves the original. Journal numbers use the shared transaction-safe sequence foundation and are never reused after committed allocation.

## Posting rules and source evidence

Automatic posting rules are centralized, code-versioned at version 1, and identified by Business + source module/type/ID + rule code/version. Exact replay reuses the existing Journal; conflicting reuse fails. Unknown amounts create durable unresolved posting failures instead of zero-value Journals. Checkpoints are operational progress only; Journal posting identity is the financial truth.

Rules cover Customer Invoices, payments, advances and applications, Credit Notes, refunds, COGS and restock reversals; Goods Receipts through GRNI, Supplier Invoices/payments/advances and Purchase Returns; Expenses, Other Income, capital and drawings. Receipt/Invoice variance remains visible in GRNI/clearing balances. Tax mappings are structurally supported without jurisdiction-specific rules.

## Cash and Finance evidence

Financial Accounts map physical cash, petty cash, banks, mobile money and processors to Ledger Accounts. Cash at Hand and bank ledger balances derive only from posted Journal Lines—not Sales receipts. Cash/Bank transfers debit the destination and credit the source and never affect Revenue or Expense.

Paid Expenses debit the selected Expense account and credit a Financial Account; unpaid Expenses credit an explicit Payable. Capital credits Equity, Drawings debit Equity, and Other Income is separate from Sales Revenue. Generic Manual Journals provide structural support for loans and interest without introducing an amortization engine.

## Periods, opening balances and reports

Accounting dates are distinct from occurrence timestamps. Open periods permit posting, soft-closed periods require an explicit override, and closed periods reject posting. Reopening requires actor and reason. Opening balances are balanced Journals with Business-scoped idempotency; incomplete V3 history is never reconstructed or guessed.

General Ledger, Trial Balance, Profit & Loss and Balance Sheet derive exclusively from posted lines. P&L reports unresolved unknown-COGS sources rather than claiming false precision. AR, AP, Inventory and COGS reconciliations return GL amount, operational subledger amount and explicit difference without mutating either side.

The isolated Chrome harness uses only `freeofis_v4_phase6_test`, never accesses localStorage, and deletes its database after execution.
