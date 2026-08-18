(function(root){
  'use strict';

  const KEYS=Object.freeze([
    'freeofis_inventory','freeofis_customers','freeofis_sales',
    'freeofis_payments','freeofis_expenses','freeofis_business',
    'freeofis_data_version'
  ]);

  function required(value,label){
    if(typeof value!=='string'||!value.trim())throw new Error(label+' is required.');
    return value;
  }

  function createSnapshot(storage,metadata={},clock=new Date()){
    if(!storage||typeof storage.getItem!=='function')throw new Error('Readable browser storage is required.');
    const rawValues=Object.fromEntries(KEYS.map(key=>[key,storage.getItem(key)]));
    if(rawValues.freeofis_data_version!=='3')throw new Error('V3 data version must be exactly 3 before export.');
    const createdAt=metadata.createdAt||clock.toISOString();
    if(Number.isNaN(Date.parse(createdAt)))throw new Error('Capture timestamp is invalid.');
    return{rawValues,createdBy:required(metadata.createdBy,'Operator name or ID'),buildReference:required(metadata.buildReference,'Build reference'),createdAt};
  }

  function downloadSnapshot(snapshot,documentApi=root.document,urlApi=root.URL,blobApi=root.Blob){
    const url=urlApi.createObjectURL(new blobApi([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
    const link=documentApi.createElement('a');
    link.href=url;
    link.download=`freeofis-v3-raw-snapshot-${snapshot.createdAt.replaceAll(':','-')}.json`;
    link.click();
    root.setTimeout(()=>urlApi.revokeObjectURL(url),1000);
  }

  function exportWithPrompts(){
    const createdBy=root.prompt('Operator name or ID for this snapshot:','V3 operator');
    if(createdBy===null)return;
    const buildReference=root.prompt('Reference for this V3 capture:','Free Ofis V3 data version 3');
    if(buildReference===null)return;
    try{
      const snapshot=createSnapshot(root.localStorage,{createdBy,buildReference});
      downloadSnapshot(snapshot);
      root.alert('V3 snapshot downloaded. No Free Ofis data was changed.');
    }catch(error){root.alert('Snapshot export stopped: '+error.message);}
  }

  root.FreeOfisV3SnapshotExporter=Object.freeze({KEYS,createSnapshot,downloadSnapshot,exportWithPrompts});
})(globalThis);
