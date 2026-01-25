import { App, ButtonComponent, Modal, Notice, Plugin, TAbstractFile, TFile, TFolder, normalizePath } from 'obsidian';
import { PdfConverterSettings, DEFAULT_SETTINGS } from './types';
import { PdfConverterSettingTab } from './settings';
import { convertPdf, generateMarkdownOutput, isPasswordProtected, isPandocInstalled, replaceImageReferences } from './converter';
import { resolveAttachmentPath, isInAttachmentFolder, getParentFolder } from './path-resolver';

/**
 * PDF Auto Converter Plugin
 *
 * Automatically converts .pdf files to Markdown when added to the vault.
 * Follows Obsidian plugin guidelines:
 * - Uses this.app instead of global app
 * - Uses registerEvent() for automatic cleanup
 * - Uses Vault API instead of Adapter API where possible
 * - Uses normalizePath() for all paths
 * - Uses async/await instead of Promise chains
 */
export default class PdfConverterPlugin extends Plugin {
  settings: PdfConverterSettings = DEFAULT_SETTINGS;
  private pandocAvailable = false;
  private resolvedPandocPath = '';

  async onload(): Promise<void> {
    await this.loadSettings();

    // Check if Pandoc is installed
    try {
      const pandocStatus = await isPandocInstalled(this.settings.pandocPath);
      this.pandocAvailable = pandocStatus.installed;
      this.resolvedPandocPath = pandocStatus.path ?? '';
      if (!this.pandocAvailable) {
        new Notice(
          'PDF Auto Converter: Pandoc is not installed. Please install Pandoc and configure the path in settings.',
          10000
        );
        console.error('PDF Auto Converter: Pandoc not found. Please install from https://pandoc.org/installing.html');
      }
    } catch (error) {
      console.error('PDF Auto Converter: Error checking Pandoc:', error);
      this.pandocAvailable = false;
    }

    // Add settings tab
    this.addSettingTab(new PdfConverterSettingTab(this.app, this));

    this.registerContextMenu();

    // Wait for layout to be ready before registering file event
    // This prevents processing existing files during vault initialization
    this.app.workspace.onLayoutReady(() => {
      // Register event listener for file creation
      // Using registerEvent() ensures automatic cleanup on unload
      this.registerEvent(
        this.app.vault.on('create', (file) => {
          if (file instanceof TFile) {
            this.handleFileCreate(file);
          }
        })
      );
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Recheck Pandoc availability (called after settings change).
   */
  async recheckPandoc(): Promise<{ installed: boolean; version?: string; path?: string }> {
    const status = await isPandocInstalled(this.settings.pandocPath);
    this.pandocAvailable = status.installed;
    this.resolvedPandocPath = status.path ?? '';
    return status;
  }

  /**
   * Handle file creation event.
   */
  private async handleFileCreate(file: TFile): Promise<void> {
    // Check if plugin is enabled
    if (!this.settings.enabled) {
      return;
    }

    // Check if Pandoc is available
    if (!this.pandocAvailable) {
      return;
    }

    // Only process .pdf files
    if (file.extension.toLowerCase() !== 'pdf') {
      return;
    }

    // Get attachment folder setting
    const attachmentFolderPath = this.getAttachmentFolderPath();

    // Skip if file is already in attachment folder (prevents infinite loop)
    if (isInAttachmentFolder(file.path, attachmentFolderPath)) {
      return;
    }

    // Skip if corresponding .md file already exists (prevents re-conversion on vault load)
    const mdPath = this.getMarkdownPath(file);
    if (this.app.vault.getAbstractFileByPath(mdPath)) {
      return;
    }

    await this.convertFile(file);
  }

  /**
   * Get the attachment folder path from Obsidian settings.
   */
  private getAttachmentFolderPath(): string {
    // Use vault.getConfig to respect user's attachment folder setting
    const attachmentFolder = this.app.vault.getConfig('attachmentFolderPath') as string | undefined;
    return attachmentFolder || '';
  }

  /**
   * Get whether to use markdown links from Obsidian settings.
   */
  private useMarkdownLinks(): boolean {
    return this.app.vault.getConfig('useMarkdownLinks') === true;
  }

  /**
   * Register context menu items for manual conversion.
   */
  private registerContextMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.extension.toLowerCase() === 'pdf') {
          menu.addItem((item) => {
            item
              .setTitle('Convert PDF to Markdown')
              .setIcon('file-text')
              .onClick(async () => {
                await this.convertPdfFileManually(file);
              });
          });
        }

        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Convert PDF files in folder')
              .setIcon('folder')
              .onClick(async () => {
                await this.convertFolderPdfFiles(file);
              });
          });
        }
      })
    );
  }

  /**
   * Convert a single PDF file via context menu.
   */
  private async convertPdfFileManually(file: TFile): Promise<void> {
    if (!(await this.ensurePandocAvailable())) {
      return;
    }

    const mdPath = this.getMarkdownPath(file);
    if (this.app.vault.getAbstractFileByPath(mdPath)) {
      new Notice(`Skipped "${file.basename}.pdf": Markdown file already exists.`);
      return;
    }

    await this.convertFile(file);
  }

  /**
   * Convert PDF files in a folder via context menu.
   */
  private async convertFolderPdfFiles(folder: TFolder): Promise<void> {
    if (!(await this.ensurePandocAvailable())) {
      return;
    }

    const pdfFiles = this.collectPdfFiles(folder);
    if (pdfFiles.length === 0) {
      new Notice('No PDF files found in this folder.');
      return;
    }

    const confirmed = await this.confirmBatchConversion(folder, pdfFiles.length);
    if (!confirmed) {
      return;
    }

    let converted = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of pdfFiles) {
      const mdPath = this.getMarkdownPath(file);
      if (this.app.vault.getAbstractFileByPath(mdPath)) {
        skipped++;
        continue;
      }

      const success = await this.convertFile(file, { showSuccessNotice: false });
      if (success) {
        converted++;
      } else {
        failed++;
      }
    }

    const convertedLabel = `${converted} PDF file${converted === 1 ? '' : 's'} converted`;
    const skippedLabel = skipped > 0 ? `, ${skipped} skipped` : '';
    const failedLabel = failed > 0 ? `, ${failed} failed` : '';
    new Notice(`Manual conversion complete: ${convertedLabel}${skippedLabel}${failedLabel}.`);
  }

  /**
   * Recursively collect PDF files in a folder.
   */
  private collectPdfFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        files.push(...this.collectPdfFiles(child));
      } else if (child instanceof TFile && child.extension.toLowerCase() === 'pdf') {
        files.push(child);
      }
    }

    return files;
  }

  /**
   * Ensure Pandoc is available for manual conversion.
   */
  private async ensurePandocAvailable(): Promise<boolean> {
    if (this.pandocAvailable) {
      return true;
    }

    const status = await this.recheckPandoc();
    if (!status.installed) {
      new Notice('PDF Auto Converter: Pandoc not found. Configure the path in settings.');
      return false;
    }

    return true;
  }

  private getPandocPath(): string {
    return this.resolvedPandocPath || this.settings.pandocPath;
  }

  /**
   * Get the expected Markdown path for a PDF file.
   */
  private getMarkdownPath(file: TFile): string {
    return normalizePath(`${getParentFolder(file.path)}/${file.basename}.md`.replace(/^\//, ''));
  }

  /**
   * Confirm manual conversion for a folder.
   */
  private async confirmBatchConversion(folder: TFolder, pdfCount: number): Promise<boolean> {
    const fileLabel = pdfCount === 1 ? 'PDF file' : 'PDF files';
    const targetLabel = folder.path ? `"${folder.path}"` : 'the vault root';
    const message = `Convert ${pdfCount} ${fileLabel} in ${targetLabel}?`;
    const detail = 'Includes subfolders. Existing Markdown files are skipped.';
    const modal = new ConfirmModal(this.app, { message, detail, confirmText: 'Convert' });
    return await modal.openAndWait();
  }

  /**
   * Convert a PDF file to Markdown.
   */
  private async convertFile(
    file: TFile,
    options: { showSuccessNotice?: boolean } = {}
  ): Promise<boolean> {
    const pdfName = file.basename;
    const showSuccessNotice = options.showSuccessNotice ?? true;

    try {
      // Read the file
      const buffer = await this.app.vault.readBinary(file);

      // Check if password protected
      if (await isPasswordProtected(buffer, this.getPandocPath())) {
        new Notice(`Cannot convert "${pdfName}.pdf": File is password protected.`);
        return false;
      }

      // Get settings
      const attachmentFolderPath = this.getAttachmentFolderPath();
      const useMarkdownLinks = this.useMarkdownLinks();

      // Calculate the final PDF path (in attachments folder)
      const finalPdfPath = this.settings.deleteOriginal
        ? ''
        : resolveAttachmentPath(attachmentFolderPath, file.path, file.name);

      // Convert the document
      const result = await convertPdf(
        buffer,
        pdfName,
        this.getPandocPath()
      );

      const imagePaths = new Map<string, string>();
      for (const image of result.images) {
        const imagePath = resolveAttachmentPath(
          attachmentFolderPath,
          file.path,
          image.filename
        );
        imagePaths.set(image.sourcePath, imagePath);
      }

      const convertedMarkdown = replaceImageReferences(
        result.markdown,
        imagePaths,
        useMarkdownLinks
      );

      const markdown = generateMarkdownOutput(
        convertedMarkdown,
        result.metadata,
        finalPdfPath,
        useMarkdownLinks,
        this.settings.includeFrontmatter
      );

      // Save images to attachment folder
      await this.saveImages(result.images, attachmentFolderPath, file.path);

      // Create the Markdown file in the same folder as the original
      const mdPath = normalizePath(
        `${getParentFolder(file.path)}/${pdfName}.md`.replace(/^\//, '')
      );
      await this.app.vault.create(mdPath, markdown);

      // Handle the original PDF file
      if (this.settings.deleteOriginal) {
        // Delete the original
        await this.app.vault.delete(file);
      } else {
        // Move to attachment folder
        if (finalPdfPath && finalPdfPath !== file.path) {
          // Ensure attachment folder exists
          await this.ensureFolderExists(getParentFolder(finalPdfPath));
          await this.app.vault.rename(file, finalPdfPath);
        }
      }

      // Show success notice
      const imageCount = result.images.length;
      const imageText = imageCount > 0 ? ` with ${imageCount} image${imageCount > 1 ? 's' : ''}` : '';
      if (showSuccessNotice) {
        new Notice(`Converted "${pdfName}.pdf" to Markdown${imageText}.`);
      }

      // Show warnings if any
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          new Notice(`Warning: ${warning}`, 5000);
        }
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('corrupt') || errorMessage.includes('invalid')) {
        new Notice(`Cannot convert "${pdfName}.pdf": File appears to be corrupted.`);
      } else {
        new Notice(`Error converting "${pdfName}.pdf": ${errorMessage}`);
      }

      return false;
    }
  }

  /**
   * Save extracted images to the attachment folder.
   */
  private async saveImages(
    images: Array<{ filename: string; data: ArrayBuffer }>,
    attachmentFolderPath: string,
    sourcePath: string
  ): Promise<void> {
    for (const image of images) {
      const imagePath = resolveAttachmentPath(
        attachmentFolderPath,
        sourcePath,
        image.filename
      );

      // Ensure the folder exists
      const folder = getParentFolder(imagePath);
      if (folder) {
        await this.ensureFolderExists(folder);
      }

      // Write the image using the adapter (binary files)
      // This is one case where we need the adapter API
      await this.app.vault.adapter.writeBinary(
        normalizePath(imagePath),
        image.data
      );
    }
  }

  /**
   * Ensure a folder exists, creating it if necessary.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }

    const normalizedPath = normalizePath(folderPath);
    const exists = await this.app.vault.adapter.exists(normalizedPath);

    if (!exists) {
      await this.app.vault.adapter.mkdir(normalizedPath);
    }
  }
}

class ConfirmModal extends Modal {
  private readonly message: string;
  private readonly detail?: string;
  private readonly confirmText: string;
  private readonly cancelText: string;
  private resolve: ((result: boolean) => void) | null = null;
  private result: boolean | null = null;

  constructor(
    app: App,
    options: { message: string; detail?: string; confirmText?: string; cancelText?: string }
  ) {
    super(app);
    this.message = options.message;
    this.detail = options.detail;
    this.confirmText = options.confirmText ?? 'Confirm';
    this.cancelText = options.cancelText ?? 'Cancel';
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', { text: this.message });

    if (this.detail) {
      contentEl.createEl('p', { text: this.detail });
    }

    const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });

    new ButtonComponent(buttonRow)
      .setButtonText(this.cancelText)
      .onClick(() => this.finish(false));

    new ButtonComponent(buttonRow)
      .setButtonText(this.confirmText)
      .setCta()
      .onClick(() => this.finish(true));
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolve) {
      this.resolve(this.result ?? false);
      this.resolve = null;
    }
  }

  private finish(result: boolean): void {
    this.result = result;
    this.close();
  }
}
