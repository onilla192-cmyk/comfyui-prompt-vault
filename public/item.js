(()=> {
  const KEY="prompt-vault-imported-datasets-v1";
  const DB="prompt-vault-imported-media";
  const STORE="images";
  const promptNode=document.getElementById("detail-prompt");
  const imageNode=document.getElementById("detail-image");
  const imageEmpty=document.getElementById("detail-image-empty");
  const convertButton=document.getElementById("convert-to-preset");
  const id=new URLSearchParams(window.location.search).get("id");
  const backLink=document.querySelector(".detail-back");
  if(backLink)backLink.addEventListener("click",event=>{
    event.preventDefault();
    if(window.history.length>1)window.history.back();
    else window.location.assign("/");
  });
  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function loadImage(ref){
    if(!ref||!ref.cacheKey)return;
    let database;
    try{
      database=await openDb();
      const blob=await new Promise((resolve,reject)=>{
        const request=database.transaction(STORE).objectStore(STORE).get(ref.cacheKey);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error);
      });
      if(!blob)return;
      const url=URL.createObjectURL(blob);
      imageNode.onload=()=>URL.revokeObjectURL(url);
      imageNode.onerror=()=>{URL.revokeObjectURL(url);imageEmpty.textContent="Image could not be displayed";};
      imageNode.src=url;imageNode.hidden=false;imageEmpty.hidden=true;
    }catch(error){imageEmpty.textContent="Image could not be loaded";console.warn("Could not load card image:",error);}
    finally{if(database)database.close();}
  }
  try{
    const pages=JSON.parse(localStorage.getItem(KEY)||"[]");
    const item=Array.isArray(pages)?pages.flatMap(page=>Array.isArray(page.items)?page.items:[]).find(entry=>entry.id===id):null;
    if(!item){
      promptNode.value="This item could not be found. It may have been deleted.";
      promptNode.disabled=true;promptNode.classList.add("detail-empty");
      imageEmpty.textContent="Card image unavailable";return;
    }
    promptNode.value=typeof item.prompt==="string"?item.prompt:"";
    const mediaRef=item.images&&item.images[0];
    void loadImage(mediaRef);
    convertButton.addEventListener("click",async()=>{
      const title=(item.name||promptNode.value.trim().split(/\s+/).slice(0,4).join(" ")||"Prompt Vault Preset").trim();
      if(!window.confirm('Create a copy of "'+title+'" in the main Created Presets page?'))return;
      convertButton.disabled=true;convertButton.textContent="Creating…";
      let database;
      try{
        let thumbnail=null;
        if(mediaRef&&mediaRef.cacheKey){
          database=await openDb();
          const blob=await new Promise((resolve,reject)=>{
            const request=database.transaction(STORE,"readonly").objectStore(STORE).get(mediaRef.cacheKey);
            request.onsuccess=()=>resolve(request.result||null);
            request.onerror=()=>reject(request.error||new Error("Could not read the Prompt Vault image."));
          });
          if(blob){
            const dataUrl=await new Promise((resolve,reject)=>{
              const reader=new FileReader();reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error("Could not prepare the image."));
              reader.onerror=()=>reject(reader.error||new Error("Could not read the image."));reader.readAsDataURL(blob);
            });
            thumbnail={dataUrl,width:0,height:0,type:blob.type||mediaRef.mimeType||"application/octet-stream",size:blob.size||0};
          }
        }
        const presetDb=await new Promise((resolve,reject)=>{
          const request=indexedDB.open("prompt-vault-created-presets-v1",1);
          request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error("Created Presets storage is not initialized. Open the Created Presets hub first, then try again."));};
          request.onsuccess=()=>resolve(request.result);
          request.onerror=()=>reject(request.error||new Error("Could not open Created Presets storage."));
        });
        await new Promise((resolve,reject)=>{
          const tx=presetDb.transaction("presets","readwrite");
          const preset={id:"preset-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),title,prompt:promptNode.value,createdAt:Date.now()};
          if(thumbnail)preset.thumbnail=thumbnail;
          tx.objectStore("presets").add(preset);
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Could not create preset."));
          tx.onabort=()=>reject(tx.error||new Error("Could not create preset."));
        });
        presetDb.close();
        window.alert("A copy was added to the main Created Presets page.");
      }catch(error){
        window.alert(error.message||"Could not convert this card to a preset.");
      }finally{
        if(database)database.close();
        convertButton.disabled=false;convertButton.textContent="Convert to Preset";
      }
    });
    promptNode.addEventListener("input",()=>{
      try{
        const stored=JSON.parse(localStorage.getItem(KEY)||"[]");
        let found=false;
        for(const page of stored){
          if(!Array.isArray(page.items))continue;
          const match=page.items.find(entry=>entry.id===id);
          if(match){match.prompt=promptNode.value;found=true;break;}
        }
        if(!found)throw new Error("Item no longer exists in storage.");
        localStorage.setItem(KEY,JSON.stringify(stored));
      }catch(error){console.warn("Could not save prompt:",error);}
    });
  }catch(error){
    promptNode.value="Could not load this item's prompt from this browser.";
    promptNode.disabled=true;promptNode.classList.add("detail-empty");
  }
})();