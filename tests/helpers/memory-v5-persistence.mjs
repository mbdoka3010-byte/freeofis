import { MemoryV4Persistence } from './memory-v4-persistence.mjs';
import { V5_STORE_DEFINITIONS } from '../../v5/persistence/schema.mjs';
export class MemoryV5Persistence extends MemoryV4Persistence { constructor() { super(V5_STORE_DEFINITIONS); } }
