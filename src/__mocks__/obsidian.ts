// Mock implementation of Obsidian API for testing

export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  parent: TFolder | null;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    const parts = this.name.split('.');
    this.extension = parts.pop() || '';
    this.basename = parts.join('.');
    this.parent = null;
  }
}

export class TFolder {
  path: string;
  name: string;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export abstract class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  abstract onload(): void | Promise<void>;
  onunload(): void {}

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {}

  addSettingTab(settingTab: PluginSettingTab): void {}

  registerEvent(eventRef: EventRef): void {}
}

export abstract class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  abstract display(): void;
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  addToggle(cb: (component: ToggleComponent) => any): this {
    cb(new ToggleComponent(this.controlEl));
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private value: boolean = false;
  private onChangeCb?: (value: boolean) => any;

  constructor(containerEl: HTMLElement) {
    this.toggleEl = document.createElement('div');
    containerEl.appendChild(this.toggleEl);
  }

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  getValue(): boolean {
    return this.value;
  }

  onChange(cb: (value: boolean) => any): this {
    this.onChangeCb = cb;
    return this;
  }
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl: string;
  isDesktopOnly: boolean;
}

export interface EventRef {}

export interface Vault {
  on(name: 'create', callback: (file: TFile) => any): EventRef;
  on(name: 'modify', callback: (file: TFile) => any): EventRef;
  on(name: 'delete', callback: (file: TFile) => any): EventRef;
  on(name: 'rename', callback: (file: TFile, oldPath: string) => any): EventRef;
  on(name: string, callback: (...data: any[]) => any): EventRef;

  getConfig(key: string): any;

  create(path: string, data: string | ArrayBuffer): Promise<TFile>;
  createBinary(path: string, data: ArrayBuffer): Promise<TFile>;
  read(file: TFile): Promise<string>;
  readBinary(file: TFile): Promise<ArrayBuffer>;
  modify(file: TFile, data: string): Promise<void>;
  rename(file: TFile, newPath: string): Promise<void>;
  delete(file: TFile): Promise<void>;

  getAbstractFileByPath(path: string): TFile | TFolder | null;

  adapter: DataAdapter;
}

export interface DataAdapter {
  exists(normalizedPath: string): Promise<boolean>;
  writeBinary(normalizedPath: string, data: ArrayBuffer): Promise<void>;
  mkdir(normalizedPath: string): Promise<void>;
  read(normalizedPath: string): Promise<string>;
  readBinary(normalizedPath: string): Promise<ArrayBuffer>;
}

export interface App {
  vault: Vault;
  workspace: Workspace;
  fileManager: FileManager;
}

export interface Workspace {
  getActiveFile(): TFile | null;
}

export interface FileManager {
  getAvailablePathForAttachment(filename: string, sourcePath?: string): Promise<string>;
}

// Utility function to normalize paths
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// Create mock instances for testing
export function createMockApp(): App {
  const mockAdapter: DataAdapter = {
    exists: jest.fn().mockResolvedValue(false),
    writeBinary: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(''),
    readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  };

  const mockVault: Vault = {
    on: jest.fn().mockReturnValue({}),
    getConfig: jest.fn().mockReturnValue(undefined),
    create: jest.fn().mockImplementation((path: string) => Promise.resolve(new TFile(path))),
    createBinary: jest.fn().mockImplementation((path: string) => Promise.resolve(new TFile(path))),
    read: jest.fn().mockResolvedValue(''),
    readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    modify: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    getAbstractFileByPath: jest.fn().mockReturnValue(null),
    adapter: mockAdapter,
  };

  const mockFileManager: FileManager = {
    getAvailablePathForAttachment: jest.fn().mockImplementation((filename: string) =>
      Promise.resolve(`attachments/${filename}`)
    ),
  };

  return {
    vault: mockVault,
    workspace: {
      getActiveFile: jest.fn().mockReturnValue(null),
    },
    fileManager: mockFileManager,
  };
}
