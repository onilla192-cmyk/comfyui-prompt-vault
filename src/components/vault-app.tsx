import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getBlob } from "@/lib/vault/db";
import { allCards, useVault } from "@/lib/vault/store";
import type { Folder, Preset, Thumbnail, VaultItem } from "@/lib/vault/types";
import { Check, Copy, FolderPlus, ImagePlus, Star } from "lucide-react";

export function VaultApp() {
  const boot = useVault((state) => state.boot);
  const ready = useVault((state) => state.ready);
  const notice = useVault((state) => state.notice);
  const screen = useVault((state) => state.screen);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg text-muted">
        <p>Opening the vault…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      {screen.name === "card" ? <CardDetail id={screen.id} /> : null}
      {screen.name === "preset" ? <PresetDetail id={screen.id} /> : null}
      {screen.name === "vault" || screen.name === "presets" ? <Library /> : null}
      {notice ? (
        <p
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-line px-4 py-3 text-sm ${notice.error ? "bg-danger text-paper" : "bg-paper text-ink"}`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

function Library() {
  const screen = useVault((s) => s.screen);
  const setScreen = useVault((s) => s.setScreen);
  const folders = useVault((s) => s.folders);
  const folderId = useVault((s) => s.folderId);
  const setFolderId = useVault((s) => s.setFolderId);
  const mode = screen.name === "presets" ? "presets" : "vault";
  const openFolder = mode === "presets" ? folders.find((folder) => folder.id === folderId) ?? null : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-28 pt-8 sm:max-w-5xl sm:px-8">
      <header className="flex flex-col gap-6 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl leading-none">{openFolder ? openFolder.name : "Prompt Vault"}</h1>
        <div className="flex gap-1" role="tablist">
          <Tab active={mode === "vault"} onClick={() => setScreen({ name: "vault" })}>
            Library
          </Tab>
          <Tab active={mode === "presets"} onClick={() => setScreen({ name: "presets" })}>
            Presets
          </Tab>
        </div>
      </header>
      {mode === "vault" ? <VaultGrid /> : <PresetGrid folderId={folderId} setFolderId={setFolderId} />}
      {mode === "vault" ? <VaultDock /> : null}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-10 border-b px-1 text-sm ${active ? "border-accent text-fg" : "border-transparent text-muted"}`}
    >
      {children}
    </button>
  );
}

function VaultGrid() {
  const datasets = useVault((s) => s.datasets);
  const grid = useVault((s) => !!s.layouts.library);
  const selectMode = useVault((s) => s.selectMode);
  const selected = useVault((s) => s.selected);
  const toggleSelected = useVault((s) => s.toggleSelected);
  const setScreen = useVault((s) => s.setScreen);
  const [creating, setCreating] = useState(false);
  const cards = allCards(datasets);

  return (
    <section className={`mt-2${grid ? " board is-grid" : ""}`}>
      <button type="button" onClick={() => setCreating(true)} className="row">
        <ImagePlus className="size-5 text-muted" />
        <span>
          <strong>New card</strong>
          <p>Add a prompt and an optional image.</p>
        </span>
      </button>
      {cards.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => (selectMode ? toggleSelected(item.id) : setScreen({ name: "card", id: item.id }))}
          className={`row ${selected.includes(item.id) ? "bg-surface" : ""}`}
        >
          <Thumb item={item} index={index + 1} />
        </button>
      ))}
      {!cards.length ? <p className="py-10 text-sm text-muted">No cards yet.</p> : null}
      {creating ? <CreateCard onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

function Thumb({ item, index }: { item: VaultItem; index: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = item.images[0]?.cacheKey;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let objectUrl = "";
    void getBlob(key).then((blob) => {
      if (!blob || !alive) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);
  return (
    <>
      <span className="thumb">
        {url ? <img src={url} alt="" /> : <span>No image</span>}
      </span>
      <span className="min-w-0 text-left">
        <span className="text-xs tabular-nums text-muted">{String(index).padStart(2, "0")}</span>
        <strong className="mt-1 block">{item.name || "Untitled"}</strong>
        <p>{item.prompt || "No prompt yet"}</p>
      </span>
    </>
  );
}

function VaultDock() {
  const toggleSelect = useVault((s) => s.toggleSelect);
  const selectMode = useVault((s) => s.selectMode);
  const selected = useVault((s) => s.selected);
  const deleteCards = useVault((s) => s.deleteCards);
  const clearLibrary = useVault((s) => s.clearLibrary);
  const toggleGrid = useVault((s) => s.toggleLayout);
  const grid = useVault((s) => !!s.layouts.library);
  const [importing, setImporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [menu, setMenu] = useState(false);
  const closeMenu = () => setMenu(false);

  return (
    <footer className="dock">
      <DockShell
        open={menu}
        onClose={closeMenu}
        menu={
          <>
            <p className="menu-label">Library</p>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); setImporting(true); }}>Import</button>
            <button type="button" className="menu-item danger" onClick={() => { closeMenu(); setConfirmClear(true); }}>Clear library</button>
            <p className="menu-label">Choose</p>
            <button type="button" className={`menu-item${selectMode ? " on" : ""}`} onClick={toggleSelect}>{selectMode ? "Cancel select" : "Select"}</button>
            {selectMode ? (
              <button
                type="button"
                className="menu-item danger"
                onClick={() => {
                  closeMenu();
                  if (selected.length && confirm(`Delete ${selected.length} selected card${selected.length === 1 ? "" : "s"}?`)) void deleteCards(selected);
                }}
              >
                Delete {selected.length || "selected"}
              </button>
            ) : null}
            <p className="menu-label">View</p>
            <button type="button" className={`menu-item${grid ? " on" : ""}`} onClick={() => toggleGrid("library")}>Grid view</button>
          </>
        }
        bar={
          <button type="button" className={`btn${menu ? " btn-on" : ""}`} aria-expanded={menu} onClick={() => setMenu((open) => !open)}>
            Options
          </button>
        }
      />
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {confirmClear ? (
        <Confirm
          title="Clear the whole library?"
          body="Imported cards, handmade cards, and their images are removed from this browser. Created presets stay."
          confirmLabel="Clear library"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            void clearLibrary();
          }}
        />
      ) : null}
    </footer>
  );
}

function DockShell({ open, onClose, menu, bar }: { open: boolean; onClose: () => void; menu: ReactNode; bar: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return (
    <div className="dock-anchor" ref={ref}>
      {open ? (
        <div className="menu-panel" role="menu">
          {menu}
        </div>
      ) : null}
      <div className="dock-bar">{bar}</div>
    </div>
  );
}

function DockButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn">
      {children}
    </button>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const importFile = useVault((s) => s.importFile);
  const toast = useVault((s) => s.toast);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ records: number; images: number } | null>(null);
  const [error, setError] = useState("");
  const [useImages, setUseImages] = useState(true);
  const [usePrompts, setUsePrompts] = useState(true);
  const [skip, setSkip] = useState(true);
  const [busy, setBusy] = useState(false);

  async function read(next: File) {
    setError("");
    setFile(next);
    try {
      const { validateDatasetFile } = await import("@/lib/vault/db");
      const records = validateDatasetFile(JSON.parse(await next.text()));
      setPreview({ records: records.length, images: records.reduce((sum, row) => sum + row.images.length, 0) });
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "Could not read that file.");
    }
  }

  return (
    <Modal title="Import dataset" onClose={onClose}>
      <p className="text-sm text-muted">JSON with an items array. Each item can include a prompt and data-URL images.</p>
      <label className="mt-3 flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
        {file ? file.name : "Choose a .json file"}
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) void read(next);
          }}
        />
      </label>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {preview ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            {preview.records} records, {preview.images} images
          </p>
          <label className="flex gap-2">
            <input type="checkbox" checked={usePrompts} onChange={(event) => setUsePrompts(event.target.checked)} /> Prompts
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={useImages} onChange={(event) => setUseImages(event.target.checked)} /> Images
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} /> Skip duplicate prompts
          </label>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="h-11 rounded-full px-4 text-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!file || !preview || busy}
          className="h-11 rounded-full bg-accent px-4 text-sm text-ink disabled:opacity-40"
          onClick={() => {
            if (!file) return;
            setBusy(true);
            void importFile(file, { useImages, usePrompts, skipDuplicates: skip })
              .then(() => onClose())
              .catch((reason: unknown) => {
                const message = reason instanceof SyntaxError ? "That file is not valid JSON." : reason instanceof Error ? reason.message : "Import failed.";
                setError(message);
                toast(message, true);
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}

function CreateCard({ onClose }: { onClose: () => void }) {
  const addCard = useVault((s) => s.addCard);
  const toast = useVault((s) => s.toast);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <Modal title="New card" onClose={onClose}>
      <label className="flex cursor-pointer items-center justify-center rounded-xl bg-bg text-sm text-muted">
        {preview ? <img src={preview} alt="" className="block h-auto w-full" /> : <span className="flex h-36 items-center">Optional image</span>}
        <input
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setPreview(next ? URL.createObjectURL(next) : "");
          }}
        />
      </label>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={6}
        placeholder="Prompt"
        className="mt-3 w-full rounded-xl bg-bg p-3 text-sm outline-none ring-1 ring-line"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="h-11 px-4 text-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || (!prompt.trim() && !file)}
          className="h-11 rounded-full bg-accent px-4 text-sm text-ink disabled:opacity-40"
          onClick={() => {
            setBusy(true);
            void addCard(prompt, file)
              .then(onClose)
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not create the card.", true))
              .finally(() => setBusy(false));
          }}
        >
          Create card
        </button>
      </div>
    </Modal>
  );
}

function CardDetail({ id }: { id: string }) {
  const datasets = useVault((s) => s.datasets);
  const goBack = useVault((s) => s.goBack);
  const updateCardPrompt = useVault((s) => s.updateCardPrompt);
  const deleteCards = useVault((s) => s.deleteCards);
  const convertCard = useVault((s) => s.convertCard);
  const toast = useVault((s) => s.toast);
  const item = allCards(datasets).find((entry) => entry.id === id);
  const [prompt, setPrompt] = useState(item?.prompt ?? "");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(item?.prompt ?? "");
  }, [item?.prompt, item?.id]);

  useEffect(() => {
    const key = item?.images[0]?.cacheKey;
    if (!key) return;
    let objectUrl = "";
    let alive = true;
    void getBlob(key).then((blob) => {
      if (!blob || !alive) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item?.images]);

  if (!item) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <button type="button" className="text-sm text-accent" onClick={() => goBack()}>
          Back
        </button>
        <p className="mt-6">This card is no longer in the library.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <button type="button" className="text-sm text-accent" onClick={() => goBack()}>
          ← Library
        </button>
        <h1 className="mt-3 font-display text-3xl">{item.name}</h1>
        <div className="mt-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {url ? <img src={url} alt="" className="block h-auto w-full" /> : <p className="p-8 text-sm text-muted">No image on this card.</p>}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="mb-3 flex flex-wrap gap-2">
          <DockButton
            onClick={() => {
              void navigator.clipboard.writeText(prompt).then(() => toast("Prompt copied."));
            }}
          >
            <Copy className="size-4" /> Copy
          </DockButton>
          <DockButton
            onClick={() => {
              void convertCard(id).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not convert.", true));
            }}
          >
            Make preset
          </DockButton>
          <DockButton
            onClick={() => {
              if (confirm("Delete this card?")) void deleteCards([id]);
            }}
          >
            Delete
          </DockButton>
        </div>
        <textarea
          value={prompt}
          aria-label="Prompt"
          onChange={(event) => {
            setPrompt(event.target.value);
            updateCardPrompt(id, event.target.value);
          }}
          className="min-h-80 flex-1 rounded-2xl bg-surface p-4 text-sm leading-relaxed ring-1 ring-line outline-none"
        />
        <p className="mt-2 text-xs text-muted">Edits save as you type.</p>
      </div>
    </main>
  );
}

function PresetGrid({ folderId, setFolderId }: { folderId: string | null; setFolderId: (id: string | null) => void }) {
  const folders = useVault((s) => s.folders);
  const presets = useVault((s) => s.presets);
  const grid = useVault((s) => !!s.layouts[folderId ?? "presets"]);
  const starredOnly = useVault((s) => s.starredOnly);
  const selectMode = useVault((s) => s.selectMode);
  const selected = useVault((s) => s.selected);
  const toggleSelected = useVault((s) => s.toggleSelected);
  const setScreen = useVault((s) => s.setScreen);
  const exportPresets = useVault((s) => s.exportPresets);
  const [editor, setEditor] = useState<Preset | null | "new">(null);
  const [folderEditor, setFolderEditor] = useState<Folder | "new" | null>(null);
  const current = folders.find((folder) => folder.id === folderId) ?? null;
  const visibleFolders = folders
    .filter((folder) => (folder.parentId || null) === folderId);
  const visiblePresets = presets
    .filter((preset) => (preset.folderId || null) === folderId)
    .filter((preset) => !starredOnly || preset.starred)
    .slice()
    .sort((a, b) => Number(!!b.starred) - Number(!!a.starred) || a.createdAt - b.createdAt);

  function presetRow(preset: Preset) {
    const shot = preset.thumbnail?.posterDataUrl || (preset.thumbnail?.type?.startsWith("image/") ? preset.thumbnail.dataUrl : "");
    return (
      <button
        key={preset.id}
        type="button"
        onClick={() => (selectMode ? toggleSelected(preset.id) : setScreen({ name: "preset", id: preset.id }))}
        className={`row ${selected.includes(preset.id) ? "bg-surface" : ""}`}
      >
        <span className="thumb">{shot ? <img src={shot} alt="" /> : <span>No image</span>}</span>
        <span className="min-w-0 text-left">
          <strong className={`block${preset.starred ? " starred" : ""}`}>
            {preset.starred ? "★ " : ""}
            {preset.title}
          </strong>
          <p>{preset.prompt}</p>
        </span>
      </button>
    );
  }

  return (
    <>
      <section className={`mt-2${grid ? " board is-grid" : ""}`}>
        {visiblePresets.filter((preset) => preset.starred).map((preset) => presetRow(preset))}
        {visibleFolders.map((folder) => (
          <FolderCard key={folder.id} folder={folder} onOpen={() => setFolderId(folder.id)} onEdit={() => setFolderEditor(folder)} onExport={() => exportPresets(folder)} />
        ))}
        {visiblePresets.filter((preset) => !preset.starred).map((preset) => presetRow(preset))}
      </section>
      {!visibleFolders.length && !visiblePresets.length ? <p className="py-8 text-sm text-muted">Nothing in this folder yet.</p> : null}
      <PresetDock
        folderId={folderId}
        folder={current}
        onNewPreset={() => setEditor("new")}
        onNewFolder={() => setFolderEditor("new")}
        onRenameFolder={() => current && setFolderEditor(current)}
        onBack={() => setFolderId(current?.parentId ?? null)}
      />
      {editor ? (
        <PresetEditor
          preset={editor === "new" ? null : editor}
          folderId={folderId}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {folderEditor ? (
        <FolderDialog folder={folderEditor === "new" ? null : folderEditor} parentId={folderId} onClose={() => setFolderEditor(null)} onDeleted={() => setFolderId(current?.parentId ?? null)} />
      ) : null}
    </>
  );
}

function FolderCard({ folder, onOpen, onEdit, onExport }: { folder: Folder; onOpen: () => void; onEdit: () => void; onExport: () => void }) {
  const [menu, setMenu] = useState(false);
  const timer = useRef<number | null>(null);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (menu) return;
          onOpen();
        }}
        onPointerDown={() => {
          timer.current = window.setTimeout(() => setMenu(true), 480);
        }}
        onPointerUp={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onPointerLeave={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu(true);
        }}
        className="row w-full"
      >
        <FolderPlus className="size-5 text-muted" />
        <span className="font-display text-xl leading-tight">{folder.name}</span>
      </button>
      {menu ? (
        <div className="absolute inset-x-2 top-2 z-10 rounded-xl bg-ink p-1 text-sm text-paper shadow-lg">
          <button type="button" className="block w-full rounded-lg px-3 py-2 text-left" onClick={() => { setMenu(false); onOpen(); }}>
            Open
          </button>
          <button type="button" className="block w-full rounded-lg px-3 py-2 text-left" onClick={() => { setMenu(false); onExport(); }}>
            Export
          </button>
          <button type="button" className="block w-full rounded-lg px-3 py-2 text-left" onClick={() => { setMenu(false); onEdit(); }}>
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PresetThumb({ preset }: { preset: Preset }) {
  const src = preset.thumbnail?.posterDataUrl || (preset.thumbnail?.type?.startsWith("image/") ? preset.thumbnail.dataUrl : "");
  if (!src) {
    return (
      <span className="plate">
        <span className="text-[11px] text-muted">{preset.starred ? "Starred" : "Preset"}</span>
        <span>
          <strong className="mb-2 block">{preset.title}</strong>
          <p>{preset.prompt}</p>
        </span>
      </span>
    );
  }
  return (
    <span className="relative block aspect-[4/5]">
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-ink/80 px-3 py-3">
        {preset.starred ? <Star className="size-3 fill-fg text-fg" /> : null}
        <strong className="font-display truncate text-base">{preset.title}</strong>
      </span>
    </span>
  );
}

function PresetDock({
  folderId,
  folder,
  onNewPreset,
  onNewFolder,
  onRenameFolder,
  onBack,
}: {
  folderId: string | null;
  folder: Folder | null;
  onNewPreset: () => void;
  onNewFolder: () => void;
  onRenameFolder: () => void;
  onBack: () => void;
}) {
  const selectMode = useVault((s) => s.selectMode);
  const toggleSelect = useVault((s) => s.toggleSelect);
  const selected = useVault((s) => s.selected);
  const deleteSelectedPresets = useVault((s) => s.deleteSelectedPresets);
  const moveSelected = useVault((s) => s.moveSelected);
  const folders = useVault((s) => s.folders);
  const exportPresets = useVault((s) => s.exportPresets);
  const importPresets = useVault((s) => s.importPresets);
  const toast = useVault((s) => s.toast);
  const pageId = folderId ?? "presets";
  const toggleGrid = useVault((s) => s.toggleLayout);
  const grid = useVault((s) => !!s.layouts[pageId]);
  const starredOnly = useVault((s) => s.starredOnly);
  const toggleStarredOnly = useVault((s) => s.toggleStarredOnly);
  const [moving, setMoving] = useState(false);
  const [destination, setDestination] = useState("");
  const presets = useVault((s) => s.presets);
  const setSelected = useVault((s) => s.setSelected);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderFileRef = useRef<HTMLInputElement>(null);
  const visibleIds = presets
    .filter((preset) => (preset.folderId || null) === folderId)
    .filter((preset) => !starredOnly || preset.starred)
    .map((preset) => preset.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const [menu, setMenu] = useState(false);
  const closeMenu = () => setMenu(false);

  return (
    <footer className="dock">
      <DockShell
        open={menu}
        onClose={closeMenu}
        menu={
          <>
            <p className="menu-label">Make</p>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); onNewPreset(); }}>New preset</button>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); onNewFolder(); }}>New folder</button>
            <p className="menu-label">Choose</p>
            <button type="button" className={`menu-item${selectMode ? " on" : ""}`} onClick={toggleSelect}>{selectMode ? "Cancel select" : "Select"}</button>
            <button
              type="button"
              className={`menu-item${allSelected ? " on" : ""}`}
              onClick={() => {
                if (!visibleIds.length) return;
                setSelected(allSelected ? [] : visibleIds);
              }}
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            {selectMode ? (
              <>
                <button type="button" className="menu-item" onClick={() => { closeMenu(); if (selected.length) setMoving(true); }}>
                  Move {selected.length || ""}
                </button>
                <button
                  type="button"
                  className="menu-item danger"
                  onClick={() => {
                    closeMenu();
                    if (selected.length && confirm(`Delete ${selected.length} preset${selected.length === 1 ? "" : "s"}?`)) void deleteSelectedPresets();
                  }}
                >
                  Delete {selected.length || ""}
                </button>
              </>
            ) : null}
            <p className="menu-label">View</p>
            <button type="button" className={`menu-item${starredOnly ? " on" : ""}`} onClick={toggleStarredOnly}>{starredOnly ? "Show all" : "Starred only"}</button>
            <button type="button" className={`menu-item${grid ? " on" : ""}`} onClick={() => toggleGrid(pageId)}>Grid view</button>
            <p className="menu-label">Files</p>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); exportPresets(); }}>Export</button>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); fileRef.current?.click(); }}>Import</button>
            <button type="button" className="menu-item" onClick={() => { closeMenu(); folderFileRef.current?.click(); }}>Import folder</button>
            {folder ? (
              <>
                <p className="menu-label">This folder</p>
                <button type="button" className="menu-item" onClick={() => { closeMenu(); exportPresets(folder); }}>Export folder</button>
                <button type="button" className="menu-item" onClick={() => { closeMenu(); onRenameFolder(); }}>Rename</button>
              </>
            ) : null}
          </>
        }
        bar={
          <>
            {folder ? (
              <button type="button" className="btn" onClick={onBack}>
                ← {folder.parentId ? folders.find((item) => item.id === folder.parentId)?.name ?? "Back" : "All presets"}
              </button>
            ) : null}
            <button type="button" className={`btn${menu ? " btn-on" : ""}`} aria-expanded={menu} onClick={() => setMenu((open) => !open)}>
              Options
            </button>
          </>
        }
      />
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void importPresets(file, false).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Import failed.", true));
        }}
      />
      <input
        ref={folderFileRef}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void importPresets(file, true).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Import failed.", true));
        }}
      />
      {moving ? (
        <Modal title="Move presets" onClose={() => setMoving(false)}>
          <select value={destination} onChange={(event) => setDestination(event.target.value)} className="h-11 w-full rounded-xl bg-bg px-3 ring-1 ring-line">
            <option value="">Main presets</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="h-11 rounded-full bg-accent px-4 text-sm text-ink"
              onClick={() => {
                void moveSelected(destination || null);
                setMoving(false);
              }}
            >
              Move
            </button>
          </div>
        </Modal>
      ) : null}
    </footer>
  );
}

function PresetEditor({ preset, folderId, onClose }: { preset: Preset | null; folderId: string | null; onClose: () => void }) {
  const folders = useVault((s) => s.folders);
  const savePresetDraft = useVault((s) => s.savePresetDraft);
  const toast = useVault((s) => s.toast);
  const [title, setTitle] = useState(preset?.title ?? "");
  const [prompt, setPrompt] = useState(preset?.prompt ?? "");
  const [dest, setDest] = useState(preset?.folderId ?? folderId ?? "");
  const [thumb, setThumb] = useState<Thumbnail | null>(preset?.thumbnail ?? null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={preset ? "Edit preset" : "New preset"} onClose={onClose}>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="h-11 w-full rounded-xl bg-bg px-3 ring-1 ring-line" />
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} placeholder="Prompt" className="mt-3 w-full rounded-xl bg-bg p-3 text-sm ring-1 ring-line" />
      <select value={dest} onChange={(event) => setDest(event.target.value)} className="mt-3 h-11 w-full rounded-xl bg-bg px-3 ring-1 ring-line">
        <option value="">Main presets</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      <div className="mt-3 flex items-center gap-3">
        {thumb ? <img src={thumb.posterDataUrl || thumb.dataUrl} alt="" width={thumb.width || undefined} height={thumb.height || undefined} className="block h-auto max-h-40 w-auto max-w-full rounded-lg" /> : <span className="text-sm text-muted">No media</span>}
        <label className="h-11 cursor-pointer rounded-full bg-surface px-4 text-sm leading-[2.75rem] ring-1 ring-line">
          Upload
          <input
            hidden
            type="file"
            accept="image/*,video/mp4"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void import("@/lib/vault/db").then(({ fileToThumbnail }) =>
                fileToThumbnail(file).then(setThumb).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not read that file.", true)),
              );
            }}
          />
        </label>
        {thumb ? (
          <button type="button" className="text-sm text-muted" onClick={() => setThumb(null)}>
            Remove
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="h-11 px-4 text-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          className="h-11 rounded-full bg-accent px-4 text-sm text-ink"
          onClick={() => {
            setBusy(true);
            void savePresetDraft({ id: preset?.id, title, prompt, folderId: dest || null, thumbnail: thumb })
              .then(onClose)
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not save.", true))
              .finally(() => setBusy(false));
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function FolderDialog({
  folder,
  parentId,
  onClose,
  onDeleted,
}: {
  folder: Folder | null;
  parentId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const createOrRenameFolder = useVault((s) => s.createOrRenameFolder);
  const deleteFolder = useVault((s) => s.deleteFolder);
  const toast = useVault((s) => s.toast);
  const [name, setName] = useState(folder?.name ?? "");
  return (
    <Modal title={folder ? "Edit folder" : "New folder"} onClose={onClose}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" className="h-11 w-full rounded-xl bg-bg px-3 ring-1 ring-line" />
      <div className="mt-4 flex justify-between gap-2">
        {folder ? (
          <button
            type="button"
            className="h-11 text-sm text-danger"
            onClick={() => {
              if (!confirm("Remove this folder? Presets and subfolders move up one level.")) return;
              void deleteFolder(folder.id).then(() => {
                onDeleted();
                onClose();
              });
            }}
          >
            Delete folder
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="h-11 rounded-full bg-accent px-4 text-sm text-ink"
          onClick={() => {
            void createOrRenameFolder(name, folder ? { id: folder.id } : { parentId })
              .then(onClose)
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not save the folder.", true));
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function copyPromptText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => copyPromptTextFallback(text),
    );
  }
  return Promise.resolve(copyPromptTextFallback(text));
}

function copyPromptTextFallback(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function PresetDetail({ id }: { id: string }) {
  const preset = useVault((s) => s.presets.find((entry) => entry.id === id));
  const folders = useVault((s) => s.folders);
  const returnTo = useVault((s) => s.returnTo);
  const goBack = useVault((s) => s.goBack);
  const updatePreset = useVault((s) => s.updatePreset);
  const deletePreset = useVault((s) => s.deletePreset);
  const toast = useVault((s) => s.toast);
  const [prompt, setPrompt] = useState(preset?.prompt ?? "");
  const timer = useRef<number | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const media = preset?.thumbnail;
  const poster = media?.posterDataUrl || (media?.type.startsWith("image/") ? media.dataUrl : "");

  useEffect(() => setPrompt(preset?.prompt ?? ""), [preset?.id, preset?.prompt]);
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setFrameHeight(Math.round(node.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [preset?.id, poster, media?.type]);

  const backFolder = returnTo?.screen.name === "presets" && returnTo.folderId ? folders.find((folder) => folder.id === returnTo.folderId) : null;
  const backLabel = backFolder?.name ?? (returnTo?.screen.name === "vault" ? "Library" : returnTo?.screen.name === "presets" ? "Presets" : "Back");

  if (!preset) {
    return (
      <main className="px-4 py-8">
        <button type="button" className="text-sm text-accent" onClick={() => goBack()}>
          Back
        </button>
        <p className="mt-4">Preset not found.</p>
      </main>
    );
  }

  function savePrompt(value: string) {
    setPrompt(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void updatePreset(preset!.id, { prompt: value });
    }, 250);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn" onClick={() => goBack()}>
          ← {backLabel}
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!!preset.starred}
            className={`btn${preset.starred ? " btn-on" : ""}`}
            onClick={() => void updatePreset(preset.id, { starred: !preset.starred })}
          >
            <Star className={`size-4 ${preset.starred ? "fill-accent text-accent" : ""}`} />
            {preset.starred ? "Starred" : "Star"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm("Delete this preset?")) void deletePreset(preset.id);
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="mt-8">
        <TitleEditor title={preset.title} onSave={(title) => void updatePreset(preset.id, { title })} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="order-2 lg:order-1">
          <div ref={frameRef} className={`overflow-hidden rounded-2xl bg-surface ring-1 ring-line ${media ? "" : "grid min-h-72 place-items-center"}`}>
            {media?.type === "video/mp4" ? (
              <video src={media.dataUrl} poster={poster || undefined} controls playsInline className="block h-auto w-full" />
            ) : poster ? (
              <img src={poster} alt="" width={media?.width || undefined} height={media?.height || undefined} className="block h-auto w-full" />
            ) : (
              <p className="p-8 text-sm text-muted">No media yet.</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="btn cursor-pointer">
              {media ? "Replace media" : "Add media"}
              <input
                hidden
                type="file"
                accept="image/*,video/mp4"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void import("@/lib/vault/db").then(({ fileToThumbnail }) =>
                    fileToThumbnail(file)
                      .then((thumbnail) => updatePreset(preset.id, { thumbnail }))
                      .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : "Could not read media.", true)),
                  );
                }}
              />
            </label>
            {media ? (
              <button type="button" className="btn btn-danger" onClick={() => void updatePreset(preset.id, { thumbnail: undefined })}>
                Remove media
              </button>
            ) : null}
          </div>
        </section>
        <section className="order-1 flex flex-col lg:order-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xs tracking-[0.14em] text-muted uppercase">Prompt</h2>
            <button
              type="button"
              className={`btn${copied ? " btn-primary" : ""}`}
              onClick={() => {
                navigator.vibrate?.(15);
                setCopied(true);
                if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
                copiedTimer.current = window.setTimeout(() => setCopied(false), 1400);
                void copyPromptText(prompt).then((ok) => {
                  if (!ok) {
                    setCopied(false);
                    toast("Could not copy the prompt.", true);
                    return;
                  }
                  toast("Prompt copied.");
                });
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Prompt copied" : "Copy prompt"}
            </button>
          </div>
          <textarea
            value={prompt}
            aria-label="Preset prompt"
            onChange={(event) => savePrompt(event.target.value)}
            style={{ "--frame-height": frameHeight ? `${frameHeight}px` : undefined } as CSSProperties}
            className="prompt-box w-full resize-none overflow-auto rounded-2xl bg-surface p-4 text-base leading-relaxed ring-1 ring-line outline-none"
          />
          <p className="mt-2 text-xs text-muted">Edits save as you type.</p>
        </section>
      </div>
    </main>
  );
}

function TitleEditor({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  if (!editing) {
    return (
      <h1>
        <button type="button" className="font-display text-left text-4xl leading-none" onClick={() => setEditing(true)}>
          {title}
        </button>
      </h1>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value.trim());
        setEditing(false);
      }}
    >
      <input value={value} onChange={(event) => setValue(event.target.value)} className="h-11 rounded-xl bg-bg px-3 ring-1 ring-line" />
      <button type="submit" className="h-11 rounded-full bg-accent px-4 text-sm text-ink">
        Save
      </button>
    </form>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/70 p-3 sm:place-items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl bg-surface p-5 text-fg ring-1 ring-line"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
          <button type="button" aria-label="Close" className="grid size-10 place-items-center text-xl" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Confirm({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="h-11 px-4 text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="h-11 rounded-full bg-danger px-4 text-sm text-paper" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
