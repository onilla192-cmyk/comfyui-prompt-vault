import { create } from "zustand";
import {
  clearBlobs,
  createCard,
  deleteBlobs,
  downloadJson,
  ensureSeed,
  fileToThumbnail,
  importDatasetRecords,
  loadFolders,
  loadPresets,
  migrateLegacyBrowserData,
  newId,
  readDatasets,
  removeFolderRecord,
  removePreset,
  removePresets,
  saveFolder,
  savePreset,
  validateDatasetFile,
  writeDatasets,
  cleanPreset,
} from "./db";
import { UI_KEY, type Dataset, type Folder, type Preset, type Screen, type Thumbnail, type VaultItem } from "./types";

type Notice = { text: string; error?: boolean } | null;

type UiPrefs = { layouts: Record<string, boolean>; starredOnly: boolean };

function readPrefs(): UiPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(UI_KEY) || "{}") as Partial<UiPrefs>;
    const layouts = value.layouts && typeof value.layouts === "object" ? value.layouts : {};
    return { layouts, starredOnly: !!value.starredOnly };
  } catch {
    return { layouts: {}, starredOnly: false };
  }
}

type State = {
  ready: boolean;
  notice: Notice;
  screen: Screen;
  folderId: string | null;
  returnTo: { screen: Screen; folderId: string | null } | null;
  datasets: Dataset[];
  presets: Preset[];
  folders: Folder[];
  layouts: Record<string, boolean>;
  starredOnly: boolean;
  selectMode: boolean;
  selected: string[];
  boot: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setFolderId: (folderId: string | null) => void;
  goBack: () => void;
  toast: (text: string, error?: boolean) => void;
  toggleLayout: (pageId: string) => void;
  toggleStarredOnly: () => void;
  toggleSelect: () => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  importFile: (file: File, options: { useImages: boolean; usePrompts: boolean; skipDuplicates: boolean }) => Promise<string>;
  addCard: (prompt: string, file: File | null) => Promise<void>;
  updateCardPrompt: (id: string, prompt: string) => void;
  deleteCards: (ids: string[]) => Promise<void>;
  clearLibrary: () => Promise<void>;
  convertCard: (id: string) => Promise<void>;
  savePresetDraft: (draft: { id?: string; title: string; prompt: string; folderId: string | null; thumbnail: Thumbnail | null }) => Promise<void>;
  updatePreset: (id: string, patch: Partial<Preset>) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  deleteSelectedPresets: () => Promise<void>;
  moveSelected: (folderId: string | null) => Promise<void>;
  createOrRenameFolder: (name: string, options?: { id?: string; parentId?: string | null }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  exportPresets: (folder?: Folder) => void;
  importPresets: (file: File, intoFolder: boolean) => Promise<void>;
};

function persistPrefs(prefs: UiPrefs) {
  localStorage.setItem(UI_KEY, JSON.stringify(prefs));
}

export const useVault = create<State>((set, get) => ({
  ready: false,
  notice: null,
  screen: { name: "vault" },
  folderId: null,
  returnTo: null,
  datasets: [],
  presets: [],
  folders: [],
  layouts: {},
  starredOnly: false,
  selectMode: false,
  selected: [],
  toast: (text, error) => {
    set({ notice: { text, error } });
    window.setTimeout(() => {
      if (get().notice?.text === text) set({ notice: null });
    }, 3200);
  },
  boot: async () => {
    await migrateLegacyBrowserData();
    ensureSeed();
    const prefs = readPrefs();
    const [presets, folders] = await Promise.all([loadPresets(), loadFolders()]);
    set({
      ready: true,
      datasets: readDatasets(),
      presets,
      folders,
      layouts: prefs.layouts,
      starredOnly: prefs.starredOnly,
    });
  },
  setScreen: (screen) => {
    const current = get().screen;
    const openingDetail = screen.name === "card" || screen.name === "preset";
    const fromList = current.name === "vault" || current.name === "presets";
    set({
      screen,
      selectMode: false,
      selected: [],
      returnTo: openingDetail && fromList ? { screen: current, folderId: get().folderId } : get().returnTo,
    });
  },
  setFolderId: (folderId) => set({ folderId }),
  goBack: () => {
    const back = get().returnTo;
    if (!back) {
      const name = get().screen.name === "card" ? "vault" : "presets";
      set({ screen: { name }, selectMode: false, selected: [] });
      return;
    }
    set({ screen: back.screen, folderId: back.folderId, returnTo: null, selectMode: false, selected: [] });
  },
  toggleLayout: (pageId) => {
    const layouts = { ...get().layouts, [pageId]: !get().layouts[pageId] };
    persistPrefs({ layouts, starredOnly: get().starredOnly });
    set({ layouts });
  },
  toggleStarredOnly: () => {
    const starredOnly = !get().starredOnly;
    persistPrefs({ layouts: get().layouts, starredOnly });
    set({ starredOnly });
  },
  toggleSelect: () => set({ selectMode: !get().selectMode, selected: [] }),
  toggleSelected: (id) =>
    set({
      selected: get().selected.includes(id) ? get().selected.filter((item) => item !== id) : [...get().selected, id],
    }),
  setSelected: (ids) => set({ selectMode: true, selected: ids }),
  importFile: async (file, options) => {
    const parsed = validateDatasetFile(JSON.parse(await file.text()));
    const result = await importDatasetRecords({
      fileName: file.name || "dataset.json",
      records: parsed,
      existing: get().datasets,
      ...options,
    });
    set({ datasets: readDatasets() });
    const summary = `Imported ${result.page.items.length} cards and ${result.images} images. ${result.duplicates} duplicates skipped, ${result.invalid} images skipped.`;
    get().toast(summary);
    return summary;
  },
  addCard: async (prompt, file) => {
    const item = await createCard(prompt, file);
    const current = get().screen;
    set({
      datasets: readDatasets(),
      screen: { name: "card", id: item.id },
      returnTo: current.name === "vault" || current.name === "presets" ? { screen: current, folderId: get().folderId } : get().returnTo,
    });
    get().toast("Card created.");
  },
  updateCardPrompt: (id, prompt) => {
    const datasets = get().datasets.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === id ? { ...item, prompt } : item)),
    }));
    writeDatasets(datasets);
    set({ datasets });
  },
  deleteCards: async (ids) => {
    const idSet = new Set(ids);
    const removed: VaultItem[] = [];
    const datasets = get()
      .datasets.map((page) => ({
        ...page,
        items: page.items.filter((item) => {
          if (!idSet.has(item.id)) return true;
          removed.push(item);
          return false;
        }),
      }))
      .filter((page) => page.id === "starters" || page.items.length || page.id === "handmade");
    const cleaned = datasets.filter((page) => page.items.length > 0);
    writeDatasets(cleaned);
    await deleteBlobs(removed.flatMap((item) => item.images.map((image) => image.cacheKey)));
    const screen = get().screen;
    const leaving = screen.name === "card" && idSet.has(screen.id);
    set({
      datasets: cleaned,
      selectMode: false,
      selected: [],
    });
    if (leaving) get().goBack();
    get().toast(removed.length === 1 ? "Card deleted." : `${removed.length} cards deleted.`);
  },
  clearLibrary: async () => {
    writeDatasets([]);
    await clearBlobs();
    set({ datasets: [], screen: { name: "vault" }, selectMode: false, selected: [] });
    get().toast("Prompt library cleared.");
  },
  convertCard: async (id) => {
    const item = get().datasets.flatMap((page) => page.items).find((entry) => entry.id === id);
    if (!item) throw new Error("That card is gone.");
    let title = item.name || item.prompt.trim().split(/\s+/).slice(0, 4).join(" ") || "Vault preset";
    const titles = new Set(get().presets.map((preset) => preset.title.toLowerCase()));
    if (titles.has(title.toLowerCase())) title = `${title} copy`;
    let thumbnail: Thumbnail | undefined;
    const ref = item.images[0];
    if (ref) {
      const { getBlob } = await import("./db");
      const blob = await getBlob(ref.cacheKey);
      if (blob) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not copy the image.")));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        thumbnail = { dataUrl, width: 0, height: 0, type: blob.type || ref.mimeType, size: blob.size };
      }
    }
    const preset: Preset = {
      id: newId("preset"),
      title,
      prompt: item.prompt,
      createdAt: Date.now(),
      ...(thumbnail ? { thumbnail } : {}),
    };
    await savePreset(preset);
    const current = get().screen;
    set({
      presets: [...get().presets, preset],
      screen: { name: "preset", id: preset.id },
      returnTo: { screen: current, folderId: get().folderId },
    });
    get().toast("Copied into Created Presets.");
  },
  savePresetDraft: async (draft) => {
    const title = draft.title.trim();
    const prompt = draft.prompt.trim();
    if (!title || !prompt) throw new Error("Title and prompt are required.");
    if (get().presets.some((preset) => preset.id !== draft.id && preset.title.toLowerCase() === title.toLowerCase())) {
      throw new Error("A preset with that title already exists.");
    }
    const current = get().presets.find((preset) => preset.id === draft.id);
    const preset: Preset = {
      ...(current ?? { id: newId("preset"), createdAt: Date.now(), tags: [] }),
      title,
      prompt,
      ...(draft.folderId ? { folderId: draft.folderId } : { folderId: undefined }),
    };
    if (draft.thumbnail) preset.thumbnail = draft.thumbnail;
    else delete preset.thumbnail;
    if (!preset.folderId) delete preset.folderId;
    await savePreset(preset);
    const presets = get().presets.some((item) => item.id === preset.id)
      ? get().presets.map((item) => (item.id === preset.id ? preset : item))
      : [...get().presets, preset];
    set({ presets });
    get().toast("Preset saved.");
  },
  updatePreset: async (id, patch) => {
    const current = get().presets.find((preset) => preset.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (!next.folderId) delete next.folderId;
    if (!next.thumbnail) delete next.thumbnail;
    if (patch.tags && !patch.tags.length) delete next.tags;
    await savePreset(next);
    set({ presets: get().presets.map((preset) => (preset.id === id ? next : preset)) });
  },
  deletePreset: async (id) => {
    await removePreset(id);
    const screen = get().screen;
    const leaving = screen.name === "preset" && screen.id === id;
    set({ presets: get().presets.filter((preset) => preset.id !== id) });
    if (leaving) get().goBack();
    get().toast("Preset deleted.");
  },
  deleteSelectedPresets: async () => {
    const ids = get().selected;
    await removePresets(ids);
    set({ presets: get().presets.filter((preset) => !ids.includes(preset.id)), selected: [], selectMode: false });
    get().toast("Selected presets deleted.");
  },
  moveSelected: async (folderId) => {
    const ids = new Set(get().selected);
    const next = get().presets.map((preset) => {
      if (!ids.has(preset.id)) return preset;
      const copy = { ...preset };
      if (folderId) copy.folderId = folderId;
      else delete copy.folderId;
      return copy;
    });
    for (const preset of next) {
      if (ids.has(preset.id)) await savePreset(preset);
    }
    set({ presets: next, selected: [], selectMode: false });
    get().toast("Presets moved.");
  },
  createOrRenameFolder: async (name, options) => {
    const clean = name.trim();
    if (!clean) throw new Error("Enter a folder name.");
    const id = options?.id;
    const parentId = id ? get().folders.find((folder) => folder.id === id)?.parentId ?? null : options?.parentId ?? null;
    if (
      get().folders.some(
        (folder) => folder.id !== id && (folder.parentId || null) === parentId && folder.name.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      throw new Error("A folder with that name already exists here.");
    }
    if (id) {
      const current = get().folders.find((folder) => folder.id === id);
      if (!current) throw new Error("Folder not found.");
      const next = { ...current, name: clean };
      await saveFolder(next);
      set({ folders: get().folders.map((folder) => (folder.id === id ? next : folder)) });
    } else {
      const folder: Folder = {
        id: newId("folder"),
        name: clean,
        createdAt: Date.now(),
        ...(parentId ? { parentId } : {}),
      };
      await saveFolder(folder);
      set({ folders: [...get().folders, folder] });
    }
    get().toast("Folder saved.");
  },
  deleteFolder: async (id) => {
    const folder = get().folders.find((entry) => entry.id === id);
    if (!folder) return;
    const parentId = folder.parentId;
    const folders = get()
      .folders.filter((entry) => entry.id !== id)
      .map((entry) => {
        if (entry.parentId !== id) return entry;
        const copy = { ...entry };
        if (parentId) copy.parentId = parentId;
        else delete copy.parentId;
        return copy;
      });
    const presets = get().presets.map((preset) => {
      if (preset.folderId !== id) return preset;
      const copy = { ...preset };
      if (parentId) copy.folderId = parentId;
      else delete copy.folderId;
      return copy;
    });
    for (const entry of folders) await saveFolder(entry);
    for (const preset of presets) {
      if (get().presets.find((item) => item.id === preset.id)?.folderId === id) await savePreset(preset);
    }
    await removeFolderRecord(id);
    set({ folders, presets });
    get().toast("Folder removed. Its contents stayed in the parent.");
  },
  exportPresets: (folder) => {
    if (!folder) {
      downloadJson(
        {
          format: "comfyui-pwa-created-presets",
          version: 1,
          exportedAt: new Date().toISOString(),
          presets: get().presets,
          folders: get().folders,
        },
        "comfyui-created-presets.json",
      );
      get().toast("Presets exported.");
      return;
    }
    const presets = get()
      .presets.filter((preset) => preset.folderId === folder.id)
      .map(({ folderId: _folderId, ...preset }) => preset);
    const slug = folder.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "preset-folder";
    downloadJson(
      { format: "comfyui-pwa-created-preset-folder", version: 1, exportedAt: new Date().toISOString(), folder: { name: folder.name }, presets },
      `${slug}.json`,
    );
    get().toast("Folder exported.");
  },
  importPresets: async (file, intoFolder) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error("The selected file is not valid JSON.");
    }
    if (intoFolder) {
      const record = parsed as { format?: string; folder?: { name?: string }; presets?: unknown[] };
      if (record.format !== "comfyui-pwa-created-preset-folder" || typeof record.folder?.name !== "string" || !Array.isArray(record.presets)) {
        throw new Error("This file is not an exported preset folder.");
      }
      await get().createOrRenameFolder(record.folder.name, { parentId: null });
      const folder = [...get().folders].reverse().find((entry) => entry.name === record.folder?.name && !entry.parentId);
      if (!folder) throw new Error("Could not create the folder.");
      let added = 0;
      for (const [index, entry] of record.presets.entries()) {
        const preset = cleanPreset(entry, index);
        if (!preset) continue;
        if (get().presets.some((item) => item.title.toLowerCase() === preset.title.toLowerCase())) continue;
        preset.id = newId("preset");
        preset.folderId = folder.id;
        await savePreset(preset);
        set({ presets: [...get().presets, preset] });
        added += 1;
      }
      if (!added) throw new Error("The folder file had no new presets.");
      get().toast(`Imported ${added} presets into ${folder.name}.`);
      return;
    }
    const source = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { presets?: unknown }).presets)
        ? (parsed as { presets: unknown[] }).presets
        : null;
    if (!source) throw new Error("This file does not contain a presets list.");
    const importedFolders =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { folders?: unknown }).folders)
        ? ((parsed as { folders: unknown[] }).folders as Folder[])
        : [];
    for (const folder of importedFolders) {
      if (!folder || typeof folder.id !== "string" || typeof folder.name !== "string") continue;
      if (get().folders.some((entry) => entry.id === folder.id)) continue;
      await saveFolder(folder);
      set({ folders: [...get().folders, folder] });
    }
    let added = 0;
    for (const [index, entry] of source.entries()) {
      const preset = cleanPreset(entry, index);
      if (!preset) continue;
      if (get().presets.some((item) => item.id === preset.id || item.title.toLowerCase() === preset.title.toLowerCase())) continue;
      if (preset.folderId && !get().folders.some((folder) => folder.id === preset.folderId)) delete preset.folderId;
      await savePreset(preset);
      set({ presets: [...get().presets, preset] });
      added += 1;
    }
    get().toast(added ? `${added} presets imported.` : "Nothing new to import. Duplicates were skipped.");
  },
}));

export function allCards(datasets: Dataset[]) {
  return datasets.flatMap((page) => page.items);
}
