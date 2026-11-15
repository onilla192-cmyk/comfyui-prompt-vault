(()=> {
  const KEY="prompt-vault-imported-datasets-v1";
  const DB="prompt-vault-imported-media";
  const STORE="images";
  const fileInput=document.getElementById("card-image-file");
  const imagePreview=document.getElementById("create-image-preview");
  const imageEmpty=document.getElementById("create-image-empty");
  const promptNode=document.getElementById("new-card-prompt");
  const saveButton=document.getElementById("save-card");
  const errorNode=document.getElementById("create-error");
  const cancelLink=document.getElementById("cancel-create");
  let selectedFile=null;
  let previewUrl=null;
  const makeId=p=>p+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  function rememberPosition(){
    try{sessionStorage.setItem("prompt-vault-gallery-scroll-y",String(window.history.state?.galleryY??0));}catch{}
  }
  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function saveBlob(key,blob){
    const database=await openDb();
    try{
      await new Promise((resolve,reject)=>{
        const transaction=database.transaction(STORE,"readwrite");
        transaction.objectStore(STORE).put(blob,key);
        transaction.oncomplete=resolve;
        transaction.onerror=()=>reject(transaction.error||new Error("Could not save image."));
        transaction.onabort=()=>reject(transaction.error||new Error("Image save was interrupted."));
      });
    }finally{database.close();}
  }
  function showError(message){errorNode.textContent=message;errorNode.hidden=false;}
  document.getElementById("choose-card-image").addEventListener("click",()=>fileInput.click());
  fileInput.addEventListener("change",()=>{
    const file=fileInput.files&&fileInput.files[0];
    if(!file)return;
    if(!file.type.startsWith("image/")){showError("Choose a valid image file.");return;}
    selectedFile=file;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(file);
    imagePreview.src=previewUrl;
    imagePreview.hidden=false;
    imageEmpty.hidden=true;
    saveButton.disabled=false;
    errorNode.hidden=true;
  });
  cancelLink.addEventListener("click",event=>{
    event.preventDefault();
    rememberPosition();
    if(window.history.length>1)window.history.back();
    else window.location.assign("/");
  });
  saveButton.addEventListener("click",async()=>{
    if(!selectedFile){showError("Choose an image before creating the card.");return;}
    saveButton.disabled=true;
    saveButton.textContent="Saving…";
    try{
      const imageKey=makeId("media");
      await saveBlob(imageKey,selectedFile);
      const existing=JSON.parse(localStorage.getItem(KEY)||"[]");
      if(!Array.isArray(existing))throw new Error("Stored gallery data is invalid.");
      const prompt=promptNode.value;
      const item={id:makeId("item"),name:prompt.trim().split(/\s+/).slice(0,4).join(" ")||"New card",prompt,images:[{id:makeId("ref"),cacheKey:imageKey,filename:selectedFile.name,mimeType:selectedFile.type||"image/*"}]};
      const page={id:makeId("dataset"),name:"Created cards",importedAt:new Date().toISOString(),items:[item]};
      localStorage.setItem(KEY,JSON.stringify([page,...existing]));
      try{sessionStorage.removeItem("prompt-vault-gallery-scroll-y");}catch{}
      window.location.href="/";
    }catch(error){
      saveButton.disabled=false;
      saveButton.textContent="Create card";
      showError(error instanceof Error?error.message:"Could not create card.");
    }
  });
  window.addEventListener("beforeunload",()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);});
  try{
    const position=sessionStorage.getItem("prompt-vault-gallery-scroll-y");
    if(position!==null)window.history.replaceState({galleryY:Number(position)}, "");
  }catch{}
})();