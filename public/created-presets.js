(() => {
  'use strict';
  // This feature owns a dedicated database. It never opens or scans other databases.
  const DB_NAME = 'prompt-vault-created-presets-v1';
  const DB_VERSION = 1;
  const PRESETS = 'presets';
  const FOLDERS = 'folders';
  const $ = (id) => document.getElementById(id);
  const state = { presets: [], folders: [], folderId: null, mode: '', selected: new Set(), editingId: null, editingFolderId: null, thumbnail: null };
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRESETS)) db.createObjectStore(PRESETS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open Created Presets storage.'));
  });
  async function readAll(storeName) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Could not read Created Presets.'));
    });
  }
  async function put(storeName, value, method = 'put') {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName)[method](value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save changes.'));
      tx.onabort = () => reject(tx.error || new Error('Save was cancelled.'));
    });
  }
  async function remove(storeName, id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not delete item.'));
      tx.onabort = () => reject(tx.error || new Error('Delete was cancelled.'));
    });
  }
  const uid = (prefix) => prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const say = (message, error = false) => { $('cp-status').textContent = message; $('cp-status').classList.toggle('error', error); };
  const visible = () => state.presets.filter((p) => (p.folderId || null) === state.folderId).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
  const safeText = (tag, value, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; el.textContent = value; return el; };
  async function refresh() {
    const [presets, folders] = await Promise.all([readAll(PRESETS), readAll(FOLDERS)]);
    state.presets = presets.filter(p => p && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.prompt === 'string');
    state.folders = folders.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string');
    if (state.folderId && !state.folders.some(f => f.id === state.folderId)) state.folderId = null;
    render();
  }
  function render() {
    $('cp-folder-grid').replaceChildren();
    $('cp-card-grid').replaceChildren();
    $('cp-folder-grid').hidden = !!state.folderId;
    if (state.folderId) {
      const current = state.folders.find(f => f.id === state.folderId);
      const bar = document.createElement('div'); bar.className = 'cp-current-folder';
      const back = safeText('button', '← All presets'); back.type = 'button'; back.addEventListener('click', () => { state.folderId = null; state.selected.clear(); render(); });
      const name = safeText('strong', current ? current.name : 'Folder');
      const exp = safeText('button', 'Export Folder'); exp.type='button'; exp.addEventListener('click', () => exportFolder(current));
      const edit = safeText('button', 'Edit Folder'); edit.type='button'; edit.addEventListener('click', () => openFolderEditor(current));
      bar.append(back,name,exp,edit); $('cp-folder-grid').append(bar); $('cp-folder-grid').hidden = false;
    } else {
      state.folders.sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach(folder => {
        const card = document.createElement('article'); card.className = 'cp-folder-card';
        const openFolder = () => { state.folderId=folder.id; state.selected.clear(); state.mode=''; updateModeButtons(); render(); };
        const open = safeText('button', ''); open.type='button'; open.className='cp-folder-open';
        const iconWrap=document.createElement('span'); iconWrap.className='cp-folder-icon';
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('aria-hidden','true');
        const iconPath=document.createElementNS('http://www.w3.org/2000/svg','path');
        iconPath.setAttribute('d','M3 6.5h6l2 2H21v9.5H3z');
        icon.append(iconPath); iconWrap.append(icon);
        const divider=document.createElement('span'); divider.className='cp-folder-divider'; divider.setAttribute('aria-hidden','true');
        open.append(iconWrap,divider,safeText('strong', folder.name));
        let clickTimer = null, highlightTimer = null;
        open.addEventListener('click', () => {
          if (clickTimer) {
            clearTimeout(clickTimer); clickTimer = null;
            if (highlightTimer) clearTimeout(highlightTimer);
            card.classList.remove('is-clicked');
            document.querySelectorAll('.cp-folder-menu').forEach(menu => menu.remove());
            document.querySelectorAll('.cp-folder-backdrop').forEach(backdrop => backdrop.remove());
            document.querySelectorAll('.cp-folder-card').forEach(item => item.classList.remove('cp-menu-open'));
            const backdrop=document.createElement('div'); backdrop.className='cp-folder-backdrop';
            const menu = document.createElement('div'); menu.className='cp-folder-menu';
            const closeMenu=()=>{menu.remove();backdrop.remove();card.classList.remove('cp-menu-open');};
            backdrop.addEventListener('click',closeMenu);
            const openItem=safeText('button','Open'); openItem.type='button'; openItem.addEventListener('click',()=>{closeMenu();openFolder();});
            const exportItem=safeText('button','Export'); exportItem.type='button'; exportItem.addEventListener('click',()=>{closeMenu();exportFolder(folder);});
            const editItem=safeText('button','Edit'); editItem.type='button'; editItem.addEventListener('click',()=>{closeMenu();openFolderEditor(folder);});
            menu.append(openItem,exportItem,editItem);
            card.classList.add('cp-menu-open');
            document.body.append(backdrop);
            card.append(menu);
            return;
          }
          card.classList.add('is-clicked');
          highlightTimer = setTimeout(() => card.classList.remove('is-clicked'), 520);
          clickTimer = setTimeout(() => { clickTimer = null; }, 320);
        });
        card.append(open); $('cp-folder-grid').append(card);
      });
    }
    const items = visible();
    items.forEach(preset => {
      const card=document.createElement('article'); card.className='cp-preset-card';
      if (state.selected.has(preset.id)) card.classList.add('selected');
      if (preset.thumbnail && preset.thumbnail.dataUrl) { const img=document.createElement('img'); img.src=preset.thumbnail.dataUrl; img.alt=''; img.loading='lazy'; card.append(img); }
      else card.append(safeText('div','✦ Prompt card','cp-preset-placeholder'));
      const body=document.createElement('div'); body.className='cp-preset-copy';
      body.append(safeText('strong',preset.title),safeText('p',preset.prompt,'cp-preset-prompt')); card.append(body);
      const actions=document.createElement('div'); actions.className='cp-card-actions';
      if (state.mode) {
        const select=safeText('button',state.selected.has(preset.id)?'Selected':'Select'); select.type='button'; select.addEventListener('click',()=>{state.selected.has(preset.id)?state.selected.delete(preset.id):state.selected.add(preset.id);render();}); actions.append(select);
      } else {
        const edit=safeText('button','Edit'); edit.type='button'; edit.addEventListener('click',()=>openEditor(preset));
        const del=safeText('button','Delete'); del.type='button'; del.className='danger'; del.addEventListener('click',()=>deletePresets([preset.id]));
        actions.append(edit,del);
      }
      card.append(actions); $('cp-card-grid').append(card);
    });
    if (!items.length) $('cp-card-grid').append(safeText('p',state.folderId?'This folder is empty. Create a preset or move one here.':'No created presets yet. Use New Preset or import a JSON file.','cp-empty'));
    $('cp-folder-select').replaceChildren(new Option('Main Created Presets',''));
    $('cp-move-destination').replaceChildren(new Option('Main Created Presets',''));
    state.folders.forEach(f=>{ $('cp-folder-select').add(new Option(f.name,f.id)); $('cp-move-destination').add(new Option(f.name,f.id)); });
    $('cp-folder-select').value='';
    $('cp-move-destination').value='';
    $('cp-new').disabled=!!state.mode;
    $('cp-new-folder').disabled=!!state.folderId || !!state.mode;
    updateModeButtons();
  }
  function updateModeButtons() {
    $('cp-move-mode').classList.toggle('active',state.mode==='move');
    $('cp-delete-mode').classList.toggle('active',state.mode==='delete');
    $('cp-move-mode').textContent=state.mode==='move'?'Cancel Move':'Move';
    $('cp-delete-mode').textContent=state.mode==='delete'?'Cancel Delete':'Delete';
    $('cp-move-mode').disabled=state.mode==='delete';
    $('cp-delete-mode').disabled=state.mode==='move';
    $('cp-move-selected').hidden=state.mode!=='move';
    $('cp-delete-selected').hidden=state.mode!=='delete';
    $('cp-move-selected').textContent='Move Selected ('+state.selected.size+')';
    $('cp-delete-selected').textContent='Delete Selected ('+state.selected.size+')';
  }
  function closeEditor() { $('cp-dialog').hidden=true; state.editingId=null; state.thumbnail=null; }
  function openEditor(preset) {
    state.editingId=preset?.id || null; state.thumbnail=preset?.thumbnail || null;
    $('cp-dialog-title').textContent=preset?'Edit Preset':'Create Preset';
    $('cp-title').value=preset?.title || ''; $('cp-prompt').value=preset?.prompt || '';
    $('cp-folder-select').value=preset?.folderId || state.folderId || '';
    $('cp-thumbnail-preview').replaceChildren();
    if(state.thumbnail){const img=document.createElement('img');img.src=state.thumbnail.dataUrl;img.alt='Thumbnail preview';$('cp-thumbnail-preview').append(img);}
    else $('cp-thumbnail-preview').textContent='No thumbnail attached';
    $('cp-image-info').textContent=state.thumbnail?state.thumbnail.width+' × '+state.thumbnail.height+' px · '+Math.max(1,Math.round(state.thumbnail.size/1024))+' KB':'Images are compressed on upload while keeping their original proportions.';
    $('cp-dialog').hidden=false; $('cp-title').focus();
  }
  async function savePreset() {
    const title=$('cp-title').value.trim(), prompt=$('cp-prompt').value.trim(), folderId=$('cp-folder-select').value || null;
    if(!title||!prompt){say('Preset title and prompt are required.',true);return;}
    if(state.presets.some(p=>p.id!==state.editingId&&p.title.toLowerCase()===title.toLowerCase())){say('A preset with that title already exists.',true);return;}
    if(folderId&&!state.folders.some(f=>f.id===folderId)){say('The selected folder no longer exists.',true);return;}
    const current=state.presets.find(p=>p.id===state.editingId);
    const value={...(current||{}),id:state.editingId||uid('preset'),title,prompt,createdAt:current?.createdAt||Date.now(),...(folderId?{folderId}:{})};
    if(state.thumbnail)value.thumbnail=state.thumbnail;else delete value.thumbnail;
    try{await put(PRESETS,value);closeEditor();await refresh();say('Preset saved.');}catch(e){say(e.message||'Could not save preset.',true);}
  }
  async function compressImage(file) {
    if(!file.type.startsWith('image/')) throw new Error('Choose an image file for the thumbnail.');
    if(file.size>20*1024*1024) throw new Error('Choose an image smaller than 20 MB.');
    let bitmap; try{bitmap=await createImageBitmap(file);}catch{throw new Error('This image could not be opened.');}
    try{
      if(bitmap.width*bitmap.height>24000000)throw new Error('Choose an image up to 24 megapixels.');
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare thumbnail.');
      ctx.drawImage(bitmap,0,0);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not compress thumbnail.')),'image/webp',.82));
      const saved=blob.size<file.size?blob:file;
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Could not read image.'));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(saved);});
      return {dataUrl,width:bitmap.width,height:bitmap.height,type:saved.type||file.type,size:saved.size};
    }finally{bitmap.close();}
  }
  async function createFolder(name) {
    const clean=name.trim();if(!clean)throw new Error('Enter a folder name.');
    if(state.folders.some(f=>f.name.toLowerCase()===clean.toLowerCase()))throw new Error('A folder with that name already exists.');
    const folder={id:uid('preset-folder'),name:clean,createdAt:Date.now()};await put(FOLDERS,folder,'add');return folder;
  }
  function openFolderEditor(folder) {
    state.editingFolderId=folder.id;$('cp-folder-title').textContent='Edit Folder';$('cp-folder-name').value=folder.name;
    $('cp-folder-save').textContent='Save Changes';$('cp-folder-delete').hidden=false;$('cp-folder-dialog').hidden=false;
  }
  function closeFolderEditor(){ $('cp-folder-dialog').hidden=true;state.editingFolderId=null;$('cp-folder-name').value='';$('cp-folder-save').textContent='Create Folder';$('cp-folder-delete').hidden=true;$('cp-folder-title').textContent='Create Folder'; }
  async function saveFolder(){
    try{
      const name=$('cp-folder-name').value.trim();if(!name)throw new Error('Enter a folder name.');
      if(state.folders.some(f=>f.id!==state.editingFolderId&&f.name.toLowerCase()===name.toLowerCase()))throw new Error('A folder with that name already exists.');
      if(state.editingFolderId){const f=state.folders.find(x=>x.id===state.editingFolderId);if(!f)throw new Error('Folder not found.');await put(FOLDERS,{...f,name});}
      else await createFolder(name);
      closeFolderEditor();await refresh();$('cp-status').textContent='';$('cp-status').classList.remove('error');
    }catch(e){say(e.message||'Could not save folder.',true);}
  }
  async function deleteFolder(){
    const id=state.editingFolderId;if(!id)return;
    if(!confirm('Delete this folder? Its presets will return to the main Created Presets page.'))return;
    try{
      const db=await dbPromise;
      await new Promise((resolve,reject)=>{
        const tx=db.transaction([PRESETS,FOLDERS],'readwrite'),store=tx.objectStore(PRESETS),req=store.getAll();
        req.onsuccess=()=>{(req.result||[]).forEach(p=>{if(p.folderId===id){delete p.folderId;store.put(p);}});tx.objectStore(FOLDERS).delete(id);};
        req.onerror=()=>tx.abort();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      if(state.folderId===id)state.folderId=null;closeFolderEditor();await refresh();say('Folder deleted. Presets were kept in the main list.');
    }catch(e){say(e.message||'Could not delete folder.',true);}
  }
  async function deletePresets(ids){
    const targets=[...new Set(ids)].filter(id=>state.presets.some(p=>p.id===id));if(!targets.length)return;
    if(!confirm('Permanently delete '+targets.length+' selected preset'+(targets.length===1?'':'s')+'?'))return;
    try{const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction(PRESETS,'readwrite'),store=tx.objectStore(PRESETS);targets.forEach(id=>store.delete(id));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});state.selected.clear();state.mode='';updateModeButtons();await refresh();say('Selected presets deleted.');}
    catch(e){say(e.message||'Could not delete presets.',true);}
  }
  async function moveSelected(){
    const ids=[...state.selected];if(!ids.length){say('Select at least one preset first.',true);return;}
    const folderId=$('cp-move-destination').value||null;
    try{const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction(PRESETS,'readwrite'),store=tx.objectStore(PRESETS);ids.forEach(id=>{const req=store.get(id);req.onsuccess=()=>{if(req.result){const p=req.result;if(folderId)p.folderId=folderId;else delete p.folderId;store.put(p);}};});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});state.selected.clear();state.mode='';$('cp-move-dialog').hidden=true;updateModeButtons();await refresh();say('Presets moved.');}
    catch(e){say(e.message||'Could not move presets.',true);}
  }
  function downloadJson(payload,filename){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function exportAll(){downloadJson({format:'comfyui-pwa-created-presets',version:1,exportedAt:new Date().toISOString(),presets:state.presets},'comfyui-created-presets.json');}
  function exportFolder(folder){
    if(!folder)return;
    const presets=state.presets.filter(p=>p.folderId===folder.id).map(({folderId,...p})=>p);
    downloadJson({format:'comfyui-pwa-created-preset-folder',version:1,exportedAt:new Date().toISOString(),folder:{name:folder.name},presets},(folder.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'preset-folder')+'.json');
  }
  async function importAll(file){
    let parsed;try{parsed=JSON.parse(await file.text());}catch{throw new Error('The selected file is not valid JSON.');}
    const source=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'&&Array.isArray(parsed.presets)?parsed.presets:null;
    if(!source)throw new Error('This file does not contain a presets list.');
    const existingIds=new Set(state.presets.map(p=>p.id)),titles=new Set(state.presets.map(p=>p.title.toLowerCase()));
    const imported=source.filter(v=>v&&typeof v==='object'&&typeof v.title==='string'&&v.title.trim()&&typeof v.prompt==='string'&&v.prompt.trim()).map((v,i)=>({id:typeof v.id==='string'&&v.id.trim()?v.id:uid('preset-imported-'+i),title:v.title.trim(),prompt:v.prompt.trim(),createdAt:typeof v.createdAt==='number'?v.createdAt:Date.now(),...(v.thumbnail&&typeof v.thumbnail.dataUrl==='string'&&v.thumbnail.dataUrl.startsWith('data:image/')?{thumbnail:v.thumbnail}:{})}));
    if(!imported.length)throw new Error('No valid presets were found in the selected file.');
    const add=[];
    for(const p of imported){if(existingIds.has(p.id)||titles.has(p.title.toLowerCase()))continue;existingIds.add(p.id);titles.add(p.title.toLowerCase());add.push(p);}
    for(const p of add)await put(PRESETS,p);
    await refresh();return add.length;
  }
  async function importFolder(file){
    let parsed;try{parsed=JSON.parse(await file.text());}catch{throw new Error('The selected folder file is not valid JSON.');}
    if(!parsed||parsed.format!=='comfyui-pwa-created-preset-folder'||typeof parsed.folder?.name!=='string'||!Array.isArray(parsed.presets))throw new Error('This file is not an exported preset folder.');
    const folder=await createFolder(parsed.folder.name);
    try{
      const existing=new Set(state.presets.map(p=>p.title.toLowerCase()));
      const entries=[];
      parsed.presets.forEach((p,i)=>{if(!p||typeof p.title!=='string'||!p.title.trim()||typeof p.prompt!=='string'||!p.prompt.trim())return;const title=p.title.trim();if(existing.has(title.toLowerCase()))return;existing.add(title.toLowerCase());entries.push({id:uid('preset-folder-import-'+i),title,prompt:p.prompt.trim(),createdAt:typeof p.createdAt==='number'?p.createdAt:Date.now(),folderId:folder.id,...(p.thumbnail&&typeof p.thumbnail.dataUrl==='string'&&p.thumbnail.dataUrl.startsWith('data:image/')?{thumbnail:p.thumbnail}:{})});});
      if(!entries.length)throw new Error('The exported folder contains no new valid presets.');
      for(const p of entries)await put(PRESETS,p);
      await refresh();return {folder,count:entries.length};
    }catch(e){await remove(FOLDERS,folder.id);throw e;}
  }
  const layoutToggle = $('cp-layout-toggle');
  if (layoutToggle) layoutToggle.addEventListener('click',()=>{
    const enabled=document.body.classList.toggle('cp-vault-grid-size');
    layoutToggle.setAttribute('aria-pressed',String(enabled));
    layoutToggle.classList.toggle('active',enabled);
    layoutToggle.textContent=enabled?'Default Size':'Grid Size';
    layoutToggle.title=enabled?'Return to default Created Presets card sizing':'Switch to Prompt Vault card sizing';
  });
  $('cp-new').addEventListener('click',()=>openEditor(null));
  $('cp-save').addEventListener('click',()=>void savePreset());
  $('cp-close').addEventListener('click',closeEditor);$('cp-cancel').addEventListener('click',closeEditor);
  $('cp-upload-image').addEventListener('click',()=>$('cp-image-file').click());
  $('cp-image-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{state.thumbnail=await compressImage(file);const img=document.createElement('img');img.src=state.thumbnail.dataUrl;img.alt='Thumbnail preview';$('cp-thumbnail-preview').replaceChildren(img);$('cp-image-info').textContent=state.thumbnail.width+' × '+state.thumbnail.height+' px · '+Math.max(1,Math.round(state.thumbnail.size/1024))+' KB';}catch(err){say(err.message||'Could not upload thumbnail.',true);}});
  $('cp-remove-image').addEventListener('click',()=>{state.thumbnail=null;$('cp-thumbnail-preview').textContent='No thumbnail attached';$('cp-image-info').textContent='Images are compressed on upload while keeping their original proportions.';});
  $('cp-new-folder').addEventListener('click',()=>{state.editingFolderId=null;$('cp-folder-title').textContent='Create Folder';$('cp-folder-name').value='';$('cp-folder-save').textContent='Create Folder';$('cp-folder-delete').hidden=true;$('cp-folder-dialog').hidden=false;});
  $('cp-folder-save').addEventListener('click',()=>void saveFolder());$('cp-folder-cancel').addEventListener('click',closeFolderEditor);$('cp-folder-delete').addEventListener('click',()=>void deleteFolder());
  $('cp-move-mode').addEventListener('click',()=>{state.mode=state.mode==='move'?'':'move';state.selected.clear();updateModeButtons();render();if(state.mode==='move')say('Select presets, then choose Move Selected.');});
  $('cp-delete-mode').addEventListener('click',()=>{state.mode=state.mode==='delete'?'':'delete';state.selected.clear();updateModeButtons();render();if(state.mode==='delete')say('Select presets, then choose Delete Selected.');});
  $('cp-move-selected').addEventListener('click',()=>{if(!state.selected.size){say('Select at least one preset first.',true);return;}$('cp-move-dialog').hidden=false;});
  $('cp-delete-selected').addEventListener('click',()=>void deletePresets([...state.selected]));
  $('cp-more').addEventListener('click',()=>{$('cp-more-menu').hidden=!$('cp-more-menu').hidden;});
  $('cp-export-all').addEventListener('click',()=>{exportAll();$('cp-more-menu').hidden=true;});
  $('cp-import-all').addEventListener('click',()=>{$('cp-json-file').click();$('cp-more-menu').hidden=true;});
  $('cp-import-folder').addEventListener('click',()=>{$('cp-folder-file').click();$('cp-more-menu').hidden=true;});
  $('cp-json-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const n=await importAll(file);say(n+' preset'+(n===1?'':'s')+' imported. Existing duplicates were skipped.');}catch(err){say(err.message||'Could not import presets.',true);}});
  $('cp-folder-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const result=await importFolder(file);say('Created folder “'+result.folder.name+'” with '+result.count+' presets.');}catch(err){say(err.message||'Could not import folder.',true);}});
  $('cp-move-close').addEventListener('click',()=>$('cp-move-dialog').hidden=true);
  $('cp-move-cancel').addEventListener('click',()=>$('cp-move-dialog').hidden=true);
  $('cp-move-confirm').addEventListener('click',()=>void moveSelected());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeEditor();closeFolderEditor();$('cp-move-dialog').hidden=true;$('cp-more-menu').hidden=true;}});
  $('cp-dialog').addEventListener('click',e=>{if(e.target===$('cp-dialog'))closeEditor();});
  $('cp-folder-dialog').addEventListener('click',e=>{if(e.target===$('cp-folder-dialog'))closeFolderEditor();});
  $('cp-move-dialog').addEventListener('click',e=>{if(e.target===$('cp-move-dialog'))$('cp-move-dialog').hidden=true;});
  refresh().catch(e=>say(e.message||'Could not load Created Presets.',true));
})();