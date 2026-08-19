import { createId, timestamp } from './foundation.mjs';

export const BUSINESS_OWNERSHIP_TYPES=Object.freeze(['merchant','supplier_consignment','unknown_historical']);
export const BUSINESS_ACCOUNT_TYPES=Object.freeze(['asset','liability','equity','revenue','expense']);
export const BUSINESS_FINANCIAL_ACCOUNT_TYPES=Object.freeze(['physical_cash','bank_account','other']);
export const money=(value,name='amount')=>{if(!Number.isSafeInteger(value)||value<0)throw TypeError(`${name} must be a non-negative integer minor-unit amount.`);return value};
export const text=(value,name)=>{const result=String(value??'').trim();if(!result)throw TypeError(`${name} is required.`);return result};
export const fingerprint=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export function businessBase(input={},context={}){const at=input.createdAt||timestamp(context.clock);return{id:input.id||createId(context.idOptions),ownerType:'organisation',ownerId:text(input.organisationId,'organisationId'),organisationId:text(input.organisationId,'organisationId'),workspaceId:text(input.workspaceId,'workspaceId'),unitId:input.unitId??null,createdByUserId:text(input.createdByUserId,'createdByUserId'),createdAt:at,updatedAt:input.updatedAt||at,status:input.status||'active',security:{classification:input.security?.classification||'internal',accessPolicy:'workspace'},provenance:{origin:input.provenance?.origin||'created',sourceType:input.provenance?.sourceType||null,sourceId:input.provenance?.sourceId||null,reference:input.provenance?.reference||null}}}
export const businessEntity=(input,fields,context={})=>({...businessBase(input,context),...fields});
