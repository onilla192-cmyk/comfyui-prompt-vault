(()=> {
  const KEY="prompt-vault-imported-datasets-v1";
  const DB="prompt-vault-imported-media";
  const STORE="images";
  const promptNode=document.getElementById("detail-prompt");
  const imageNode=document.getElementById("detail-image");
  const imageEmpty=document.getElementById("detail-image-empty");
  const id=new URLSearchParams(window.location.search).get("id");
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
    void loadImage(item.images&&item.images[0]);
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