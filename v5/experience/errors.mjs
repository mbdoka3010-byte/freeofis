const messages=[
  [/CONTEXT_ACCESS_DENIED|WORKSPACE_ACCESS_DENIED|WORKSPACE_DISABLED_OR_UNKNOWN|SHARED_WORK_SCOPE_DENIED/,'You no longer have access to this workspace.'],
  [/ORGANISATION|CROSS_WORKSPACE_REFERENCE_SCOPE_DENIED|BUSINESS_HANDOFF_SCOPE_DENIED/,'This item belongs to another organisation or workspace.'],
  [/PERSONAL_REFERENCE|INTEGRATION_TARGET|INTEGRATION_COPY/,'This item cannot be shared with the selected workspace.'],
  [/FINANCE|BUSINESS_SCOPE_DENIED|PERMISSION_DENIED/,'This action requires additional permission.'],
  [/SHARED_ENTITY_ACCESS_DENIED|REFERENCE_ACCESS_DENIED/,'The source item is no longer available or you cannot access it.']
];
export function friendlyError(error){const code=String(error?.message||error||'');return messages.find(([pattern])=>pattern.test(code))?.[1]||'Free Ofis could not complete that action. Please refresh your context and try again.'}
