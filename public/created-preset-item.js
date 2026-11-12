(()=>{
  'use strict';
  const DB_NAME='prompt-vault-created-presets-v1';
  const STORE='presets';
  const id=new URLSearchParams(window.location.search).get('id');
  const backButton=document.getElementById('preset-detail-back');
  if(backButton)backButton.addEventListener('click',event=>{
    event.preventDefault();
    if(document.referrer && new URL(document.referrer).origin===window.location.origin){
      window.history.back();
    }else{
      window.location.assign('/');
    }
  });

  const titleNode=document.getElementById('detail-title');
  const promptNode=document.getElementById('detail-prompt');
  const imageNode=document.getElementById('detail-image');
  const imageEmpty=document.getElementById('detail-image-empty');
  const statusNode=document.getElementById('detail-save-status');
  const editMenuButton=document.getElementById('preset-edit-menu-button');
  const editMenu=document.getElementById('preset-edit-menu');
  const editTitleButton=document.getElementById('preset-edit-title');
  const deletePresetButton=document.getElementById('preset-delete-preset');

  const tagsList=document.getElementById('preset-tags-list');
  const addTagButton=document.getElementById('preset-add-tag');
  const tagEditor=document.getElementById('preset-tag-editor');
  const tagNameInput=document.getElementById('preset-tag-name');
  const tagInfoInput=document.getElementById('preset-tag-info');
  const tagCancel=document.getElementById('preset-tag-cancel');
  const editTagButton=document.getElementById('preset-edit-tag');
  const deleteTagButton=document.getElementById('preset-delete-tag');
  const editPicker=document.getElementById('preset-edit-picker');
  const deletePicker=document.getElementById('preset-delete-picker');
  const editSelect=document.getElementById('preset-edit-select');
  const deleteSelect=document.getElementById('preset-delete-select');
  let editingTagId=null;
  let currentPreset=null;

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
  function savePresetField(field,value){
    return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      const request=store.get(id);
      request.onsuccess=()=>{
        if(!request.result){tx.abort();return;}
        const preset=request.result;
        preset[field]=value;
        store.put(preset);
        currentPreset=preset;
      };
      request.onerror=()=>tx.abort();
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Could not save tag information.'));
      tx.onabort=()=>reject(tx.error||new Error('Preset no longer exists.'));
    });
  }
  function renderTags(){
    tagsList.replaceChildren();
    (currentPreset.tags||[]).forEach((tag,index)=>{
      const item=document.createElement('div');item.className='preset-tag-item';
      const button=document.createElement('button');button.type='button';button.className='preset-tag-toggle';
      button.textContent=tag.name;button.setAttribute('aria-expanded','false');
      const info=document.createElement('div');info.className='preset-tag-info';info.hidden=true;info.textContent=tag.info;
      button.addEventListener('click',()=>{
        const opening=info.hidden;
        info.hidden=!opening;button.setAttribute('aria-expanded',String(opening));
      });
      item.append(button,info);tagsList.append(item);
    });
  }
  function closeTagEditor(){
    tagEditor.hidden=true;addTagButton.hidden=false;tagNameInput.value='';tagInfoInput.value='';editingTagId=null;
  }
  function fillTagSelect(select){
    select.replaceChildren();
    (currentPreset.tags||[]).forEach(tag=>{
      const option=document.createElement('option');option.value=tag.id;option.textContent=tag.name;select.append(option);
    });
  }
  function hideTagPickers(){editPicker.hidden=true;deletePicker.hidden=true;}

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
    editMenuButton.addEventListener('click',()=>{
      editMenu.hidden=!editMenu.hidden;
      editMenuButton.setAttribute('aria-expanded',String(!editMenu.hidden));
    });
    document.addEventListener('click',event=>{
      if(!event.target.closest('.detail-prompt-toolbar')){editMenu.hidden=true;editMenuButton.setAttribute('aria-expanded','false');}
    });
    editTitleButton.addEventListener('click',async()=>{
      editMenu.hidden=true;editMenuButton.setAttribute('aria-expanded','false');
      const next=window.prompt('Edit preset title:',titleNode.textContent);
      if(next===null)return;
      const title=next.trim();if(!title){statusNode.textContent='Preset title cannot be empty.';return;}
      try{
        await savePresetField('title',title);
        titleNode.textContent=title;document.title=title+' · Created Presets';statusNode.textContent='Title saved';
      }catch(error){statusNode.textContent=error.message||'Could not save title';}
    });
    deletePresetButton.addEventListener('click',async()=>{
      editMenu.hidden=true;editMenuButton.setAttribute('aria-expanded','false');
      if(!window.confirm('Permanently delete this preset?'))return;
      try{
        await new Promise((resolve,reject)=>{
          const tx=database.transaction(STORE,'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not delete preset.'));
          tx.onabort=()=>reject(tx.error||new Error('Could not delete preset.'));
        });
        window.location.href='/';
      }catch(error){statusNode.textContent=error.message||'Could not delete preset';}
    });

    promptNode.value=typeof preset.prompt==='string'?preset.prompt:'';
    currentPreset=preset;
    if(!Array.isArray(currentPreset.tags))currentPreset.tags=[];
    renderTags();
    addTagButton.addEventListener('click',()=>{addTagButton.hidden=true;tagEditor.hidden=false;tagNameInput.focus();});
    tagCancel.addEventListener('click',closeTagEditor);
    editTagButton.addEventListener('click',()=>{
      if(!(currentPreset.tags||[]).length){statusNode.textContent='There are no tags to edit.';return;}
      closeTagEditor();fillTagSelect(editSelect);deletePicker.hidden=true;editPicker.hidden=false;
    });
    document.getElementById('preset-edit-cancel').addEventListener('click',()=>{editPicker.hidden=true;});
    document.getElementById('preset-edit-continue').addEventListener('click',()=>{
      const tag=(currentPreset.tags||[]).find(item=>item.id===editSelect.value);if(!tag)return;
      editingTagId=tag.id;tagNameInput.value=tag.name;tagInfoInput.value=tag.info;
      editPicker.hidden=true;addTagButton.hidden=true;tagEditor.hidden=false;tagNameInput.focus();
    });
    deleteTagButton.addEventListener('click',()=>{
      if(!(currentPreset.tags||[]).length){statusNode.textContent='There are no tags to delete.';return;}
      fillTagSelect(deleteSelect);editPicker.hidden=true;deletePicker.hidden=false;
    });
    document.getElementById('preset-delete-cancel').addEventListener('click',()=>{deletePicker.hidden=true;});
    document.getElementById('preset-delete-confirm').addEventListener('click',()=>{
      const tag=(currentPreset.tags||[]).find(item=>item.id===deleteSelect.value);if(!tag)return;
      if(!window.confirm('Delete the tag "'+tag.name+'"?'))return;
      const tags=currentPreset.tags.filter(item=>item.id!==tag.id);
      statusNode.textContent='Deleting tag…';
      void savePresetField('tags',tags).then(()=>{renderTags();deletePicker.hidden=true;statusNode.textContent='Tag deleted';}).catch(error=>{statusNode.textContent=error.message||'Could not delete tag';});
    });
    tagEditor.addEventListener('submit',event=>{
      event.preventDefault();
      const name=tagNameInput.value.trim(),info=tagInfoInput.value.trim();
      if(!name||!info)return;
      const tags=[...(currentPreset.tags||[])];
      if(editingTagId){
        const index=tags.findIndex(item=>item.id===editingTagId);if(index<0)return;
        tags[index]={...tags[index],name,info};
      }else{
        tags.push({id:'tag-'+Date.now()+'-'+Math.random().toString(36).slice(2),name,info});
      }
      const wasEditing=Boolean(editingTagId);
      statusNode.textContent=wasEditing?'Updating tag…':'Saving tag…';
      void savePresetField('tags',tags).then(()=>{renderTags();closeTagEditor();statusNode.textContent=wasEditing?'Tag updated':'Tag saved';}).catch(error=>{statusNode.textContent=error.message||'Could not save tag';});
    });
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