/** Capture the selected client/root before any user confirmation or picker wait. */
export async function captureMobilePreparationScope({root,client,origin}) {
  if(typeof root!=='string'||!root||!client||typeof client.request!=='function'||typeof origin!=='string')throw new Error('The selected workspace is not ready.');
  const response=await client.request(new Request(origin+'/api/vault'));
  if(!response.ok)throw new Error('The selected knowledge base could not be read.');
  const info=await response.json();
  if(typeof info.knowledgeBaseId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(info.knowledgeBaseId))throw new Error('The selected knowledge base identity is invalid.');
  return Object.freeze({root,client,origin,knowledgeBaseId:info.knowledgeBaseId,name:typeof info.name==='string'?info.name:info.knowledgeBaseId});
}
export function prepareCapturedMobileWorkspace(scope,destination) {
  return scope.client.request(new Request(scope.origin+'/api/mobile-sync/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({knowledgeBaseId:scope.knowledgeBaseId,destination,confirmed:true})}));
}
