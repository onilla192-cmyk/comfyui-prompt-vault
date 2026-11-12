(()=> {
  const KEY="prompt-vault-imported-datasets-v1";
  const promptNode=document.getElementById("detail-prompt");
  const id=new URLSearchParams(window.location.search).get("id");
  try {
    const pages=JSON.parse(localStorage.getItem(KEY)||"[]");
    const item=Array.isArray(pages)?pages.flatMap(page=>Array.isArray(page.items)?page.items:[]).find(entry=>entry.id===id):null;
    if(!item){promptNode.textContent="This item could not be found. It may have been deleted.";promptNode.classList.add("detail-empty");}
    else if(typeof item.prompt==="string"&&item.prompt.trim()){promptNode.textContent=item.prompt;}
    else {promptNode.textContent="No prompt text was saved for this item.";promptNode.classList.add("detail-empty");}
  } catch {
    promptNode.textContent="Could not load this item's prompt from this browser.";
    promptNode.classList.add("detail-empty");
  }
})();