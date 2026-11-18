export type MediaRef = {
  id: string;
  cacheKey: string;
  filename: string;
  mimeType: string;
};

export type VaultItem = {
  id: string;
  name: string;
  prompt: string;
  images: MediaRef[];
};

export type Dataset = {
  id: string;
  name: string;
  importedAt: string;
  items: VaultItem[];
};

export type PresetTag = {
  id: string;
  name: string;
  info: string;
};

export type Thumbnail = {
  dataUrl: string;
  posterDataUrl?: string;
  width: number;
  height: number;
  type: string;
  size: number;
};

export type Preset = {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  folderId?: string;
  thumbnail?: Thumbnail;
  starred?: boolean;
  tags?: PresetTag[];
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
};

export type Screen =
  | { name: "vault" }
  | { name: "presets" }
  | { name: "card"; id: string }
  | { name: "preset"; id: string };

export const DATASET_KEY = "prompt-vault-imported-datasets-v1";
export const UI_KEY = "prompt-vault-ui-v1";
export const DB_NAME = "prompt-vault-app-v1";
export const BLOB_STORE = "blobs";
export const PRESET_STORE = "presets";
export const FOLDER_STORE = "folders";
