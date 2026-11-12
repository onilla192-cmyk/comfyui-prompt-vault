(()=>{
  'use strict';
  const DB_NAME='prompt-vault-created-presets-v1';
  const STORE='presets';
  const id=new URLSearchParams(window.location.search).get('id');
  const titleNode=document.getElementById('detail-title');
  const promptNode=document.getElementById('detail-prompt');
  const imageNode=document.getElementById('detail-image');
  const imageEmpty=document.getElementById('detail-image-empty');
  const statusNode=document.getElementById('detail-save-status');
  let database=null;
  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error('Created Presets storage was not found.'));};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Could not open Created Presets storage.'));
    });
  }
  function getPreset(db){
    return new Promise((resolve,reject)=>{
      const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error('Could not read this preset.'));
    });
  }
  function savePrompt(value){
    return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      const request=store.get(id);
      request.onsuccess=()=>{
        if(!request.result){tx.abort();return;}
        const preset=request.result;
        preset.prompt=value;
        store.put(preset);
      };
      request.onerror=()=>tx.abort();
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Could not save the prompt.'));
      tx.onabort=()=>reject(tx.error||new Error('Preset no longer exists.'));
    });
  }
  async function init(){
    if(!id)throw new Error('Preset not found.');
    database=await openDb();
    const preset=await getPreset(database);
    if(!preset)throw new Error('This preset could not be found. It may have been deleted.');
    titleNode.textContent=preset.title||'Preset';
    document.title=(preset.title||'Preset')+' · Created Presets';
    promptNode.value=typeof preset.prompt==='string'?preset.prompt:'';
    const dataUrl=preset.thumbnail&&preset.thumbnail.dataUrl;
    if(typeof dataUrl==='string'&&dataUrl.startsWith('data:image/')){
      imageNode.src=dataUrl;imageNode.hidden=false;imageEmpty.hidden=true;
    }
    let saveTimer=null;
    promptNode.addEventListener('input',()=>{
      statusNode.textContent='Saving…';
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>void savePrompt(promptNode.value).then(()=>{statusNode.textContent='Saved';}).catch(error=>{statusNode.textContent=error.message||'Could not save';}),250);
    });
  }
  init().catch(error=>{
    titleNode.textContent='Preset unavailable';
    promptNode.value=error.message||'Could not load this preset.';
    promptNode.disabled=true;
    promptNode.classList.add('detail-empty');
    imageEmpty.textContent='Preset image unavailable';
  });
  window.addEventListener('pagehide',()=>{if(database)database.close();});
})();