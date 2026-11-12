const KEY="prompt-vault-imported-datasets-v1",DB="prompt-vault-imported-media",STORE="images";
const $=id=>document.getElementById(id),gallery=$("gallery"),dialog=$("import-dialog"),fileInput=$("dataset-file"),preview=$("import-preview"),dropzone=$("import-dropzone"),errorBox=$("import-error"),confirmButton=$("confirm-import");
let dataset=null,fileName="dataset.json",done=false;
const imageUrlCache=new Map();
const makeId=p=>p+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
const galleryObserver="IntersectionObserver" in window?new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){galleryObserver.unobserve(entry.target);void loadGalleryTile(entry.target)}}},{rootMargin:"300px 0px"}):null;
function pages(){try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v:[]}catch{return[]}}
function db(){return new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function saveBlob(key,blob){const d=await db();return new Promise((ok,no)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(blob,key);t.oncomplete=()=>{d.close();ok()};t.onerror=()=>{d.close();no(t.error)}})}
async function readBlob(key){const d=await db();return new Promise((ok,no)=>{const r=d.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>{d.close();ok(r.result||null)};r.onerror=()=>{d.close();no(r.error)}})}
function decodeDataUrl(s){const m=/^data:([^;,]+)?(;base64)?,(.*)$/s.exec(s);if(!m)throw Error("Invalid embedded image data.");const raw=m[2]?atob(m[3]):decodeURIComponent(m[3]),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return new Blob([a],{type:m[1]||"application/octet-stream"})}
function validate(v){if(!v||typeof v!=="object"||Array.isArray(v))throw Error("The file must contain a JSON object.");if(!Array.isArray(v.items))throw Error("This file does not contain a valid items array.");return{items:v.items.map((x,i)=>{if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Record "+(i+1)+" is invalid.");return{prompt:x.prompt==null?"":String(x.prompt),images:Array.isArray(x.images)?x.images.filter(im=>im&&typeof im.data==="string"&&im.data.startsWith("data:")).map(im=>({filename:im.filename||"image",mimeType:im.mimeType||"image/png",data:im.data})):[]}})}}
function showError(message){errorBox.textContent=message;errorBox.hidden=false}
function reset(){dataset=null;done=false;fileInput.value="";errorBox.hidden=true;errorBox.textContent="";preview.hidden=true;dropzone.hidden=false;$("import-summary").hidden=true;$("preview-list").replaceChildren();confirmButton.disabled=false;confirmButton.textContent="Import dataset"}
function close(){dialog.hidden=true;document.body.classList.remove("dialog-open");reset()}
function openFile(file){if(!file)return;fileName=file.name||"dataset.json";file.text().then(text=>{dataset=validate(JSON.parse(text));renderPreview()}).catch(e=>showError(e instanceof SyntaxError?"The selected file is not valid JSON.":e.message||"Could not read the file."))}
function renderPreview(){const list=$("preview-list");list.replaceChildren();$("record-count").textContent=dataset.items.length;$("image-count").textContent=dataset.items.reduce((n,x)=>n+x.images.length,0);dataset.items.slice(0,50).forEach(x=>{const row=document.createElement("div");row.className="import-preview-row";if(x.images[0]){const im=document.createElement("img");im.src=x.images[0].data;im.alt="";row.append(im)}else{const no=document.createElement("div");no.className="preview-image-empty";no.textContent="—";row.append(no)}const p=document.createElement("p");p.textContent=x.prompt||"No prompt provided";row.append(p);list.append(row)});dropzone.hidden=true;preview.hidden=false;$("import-summary").hidden=true}
async function importDataset(){if(!dataset)return;const useImages=$("import-images").checked,usePrompts=$("import-prompts").checked,skip=document.querySelector('input[name="duplicates"]:checked').value==="skip";if(!useImages&&!usePrompts){showError("Choose prompts, images, or both.");return}confirmButton.disabled=true;confirmButton.textContent="Importing…";const existing=pages(),known=new Set(existing.flatMap(p=>(p.items||[]).map(i=>i.prompt).filter(Boolean))),items=[];let images=0,duplicates=0,invalid=0;for(const src of dataset.items){if(skip&&src.prompt&&known.has(src.prompt)){duplicates++;continue}const refs=[];if(useImages)for(const image of src.images){try{const blob=decodeDataUrl(image.data),key=makeId("media");await saveBlob(key,blob);refs.push({id:makeId("ref"),cacheKey:key,filename:image.filename,mimeType:image.mimeType||blob.type});images++}catch{invalid++}}const prompt=usePrompts?src.prompt:"";if(prompt||refs.length){items.push({id:makeId("item"),name:prompt.trim().split(/\s+/).slice(0,4).join(" ")||"Imported item",prompt,images:refs});if(src.prompt)known.add(src.prompt)}}const page={id:makeId("dataset"),name:fileName.replace(/\.json$/i,"")||"Imported",importedAt:new Date().toISOString(),items};try{localStorage.setItem(KEY,JSON.stringify([...existing,page]))}catch{confirmButton.disabled=false;confirmButton.textContent="Import dataset";showError("Could not store dataset metadata in this browser.");return}dataset=null;$("import-summary").textContent="Imported "+items.length+" records and "+images+" images. "+duplicates+" duplicates skipped; "+invalid+" invalid images.";$("import-summary").hidden=false;$("preview-list").replaceChildren();confirmButton.disabled=false;confirmButton.textContent="Done";done=true;await renderGallery()}
async function loadGalleryTile(tile){
  if(tile.dataset.loaded==="true"||tile.dataset.loading==="true")return;
  tile.dataset.loading="true";
  const item=tile._galleryItem,ref=item&&item.images&&item.images[0];
  try{
    if(ref){
      let url=imageUrlCache.get(ref.cacheKey);
      if(!url){
        const blob=await readBlob(ref.cacheKey);
        if(blob){url=URL.createObjectURL(blob);imageUrlCache.set(ref.cacheKey,url)}
      }
      if(url&&tile.isConnected){
        const img=document.createElement("img");
        img.loading="lazy";img.decoding="async";img.alt=item.name||"Imported image";img.src=url;
        tile.append(img);
      }
    }
  }catch(error){console.warn("Could not load gallery image:",error)}
  if(tile.isConnected&&!tile.firstChild){
    tile.classList.add("gallery-item-no-image");
    const label=document.createElement("span");label.textContent=item.name||"Imported item";tile.append(label);
  }
  tile.dataset.loaded="true";delete tile.dataset.loading;
}
function openCard(item){
  try{sessionStorage.setItem("prompt-vault-gallery-scroll-y",String(window.scrollY));}catch{}
  window.location.href="/item.html?id="+encodeURIComponent(item.id);
}
async function renderGallery(){
  const items=pages().flatMap(p=>p.items||[]);
  gallery.querySelectorAll(".gallery-empty,.gallery-item").forEach(n=>{if(galleryObserver)galleryObserver.unobserve(n);n.remove()});
  for(const item of items){
    const tile=document.createElement("article");
    tile.className="gallery-tile gallery-item";
    tile._galleryItem=item;
    tile.setAttribute("aria-label",(item.name||"Gallery item")+" — open prompt");
    tile.setAttribute("role","link");
    tile.setAttribute("tabindex","0");
    tile.addEventListener("click",()=>openCard(item));
    tile.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openCard(item)}});
    gallery.append(tile);
    if(galleryObserver)galleryObserver.observe(tile);else void loadGalleryTile(tile);
  }
}
$("import-button").addEventListener("click",()=>{dialog.hidden=false;document.body.classList.add("dialog-open");reset();fileInput.click()});$("choose-file").addEventListener("click",()=>fileInput.click());fileInput.addEventListener("change",e=>openFile(e.target.files&&e.target.files[0]));$("dialog-close").addEventListener("click",close);$("cancel-import").addEventListener("click",close);confirmButton.addEventListener("click",()=>done?close():void importDataset());dialog.addEventListener("click",e=>{if(e.target===dialog)close()});dropzone.addEventListener("dragover",e=>{e.preventDefault();dropzone.classList.add("drag-over")});dropzone.addEventListener("dragleave",()=>dropzone.classList.remove("drag-over"));dropzone.addEventListener("drop",e=>{e.preventDefault();dropzone.classList.remove("drag-over");openFile(e.dataTransfer&&e.dataTransfer.files[0])});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!dialog.hidden)close()});
renderGallery();
try{
  const savedPosition=sessionStorage.getItem("prompt-vault-gallery-scroll-y");
  if(savedPosition!==null){
    sessionStorage.removeItem("prompt-vault-gallery-scroll-y");
    const y=Number(savedPosition);
    if(Number.isFinite(y))requestAnimationFrame(()=>window.scrollTo(0,y));
  }
}catch{}

const deleteDialog=document.getElementById("delete-dialog");
function openDeleteDialog(){deleteDialog.hidden=false;document.body.classList.add("dialog-open");document.getElementById("cancel-delete").focus()}
function closeDeleteDialog(){deleteDialog.hidden=true;document.body.classList.remove("dialog-open")}
async function deleteAllData(){
  const button=document.getElementById("confirm-delete");
  button.disabled=true;button.textContent="Deleting…";
  try{
    localStorage.removeItem(KEY);
    const d=await db();
    await new Promise((resolve,reject)=>{
      const tx=d.transaction(STORE,"readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error("Could not clear image storage."));
      tx.onabort=()=>reject(tx.error||new Error("Deletion was interrupted."));
    });
    d.close();
    for(const url of imageUrlCache.values())URL.revokeObjectURL(url);
    imageUrlCache.clear();
    await renderGallery();
    closeDeleteDialog();
  }catch(error){
    button.disabled=false;button.textContent="Delete";
    window.alert(error instanceof Error?error.message:"Could not delete all data.");
  }
}
document.getElementById("delete-button").addEventListener("click",openDeleteDialog);
document.getElementById("cancel-delete").addEventListener("click",closeDeleteDialog);
document.getElementById("confirm-delete").addEventListener("click",()=>void deleteAllData());
deleteDialog.addEventListener("click",event=>{if(event.target===deleteDialog)closeDeleteDialog()});
