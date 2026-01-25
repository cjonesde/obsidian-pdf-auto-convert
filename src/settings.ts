import { App, Platform, PluginSettingTab, Setting } from 'obsidian';
import type PdfConverterPlugin from './main';

/**
 * Settings tab for the PDF Auto Converter plugin.
 *
 * Follows Obsidian plugin guidelines:
 * - Uses sentence case for UI text
 * - Uses Setting.setHeading() for section headers
 * - Avoids "settings" in heading text
 * - No default hotkeys
 */
export class PdfConverterSettingTab extends PluginSettingTab {
  plugin: PdfConverterPlugin;
  private pandocStatusEl: HTMLElement | null = null;

  constructor(app: App, plugin: PdfConverterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Pandoc status section
    new Setting(containerEl).setName('Pandoc').setHeading();

    this.createPandocStatusSetting(containerEl);

    // Conversion options section
    new Setting(containerEl).setName('Conversion').setHeading();

    // Enable/disable toggle
    new Setting(containerEl)
      .setName('Enable automatic conversion')
      .setDesc('Automatically convert .pdf files to Markdown when added to your vault.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (value) => {
            this.plugin.settings.enabled = value;
            await this.plugin.saveSettings();
          })
      );

    // Frontmatter toggle
    new Setting(containerEl)
      .setName('Add frontmatter with metadata')
      .setDesc('Include document metadata (author, dates, tags) in YAML frontmatter.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.includeFrontmatter = value;
            await this.plugin.saveSettings();
          })
      );

    // Delete original toggle
    new Setting(containerEl)
      .setName('Delete original .pdf after conversion')
      .setDesc('Remove the original PDF instead of keeping it in the attachments folder.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteOriginal)
          .onChange(async (value) => {
            this.plugin.settings.deleteOriginal = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * Create Pandoc status and path settings.
   */
  private createPandocStatusSetting(containerEl: HTMLElement): void {
    const statusSetting = new Setting(containerEl)
      .setName('Status')
      .setDesc('Checking Pandoc installation...');

    this.pandocStatusEl = statusSetting.descEl;
    this.updatePandocStatus();

    const pathHint = Platform.isMacOS
      ? 'Run "which pandoc" in Terminal to find the path.'
      : Platform.isWin
        ? 'Run "Get-Command pandoc" in PowerShell to find the path.'
        : 'Run "which pandoc" in a terminal to find the path.';

    new Setting(containerEl)
      .setName('Pandoc path')
      .setDesc(`Leave empty to use system PATH. ${pathHint}`)
      .addText((text) =>
        text
          .setPlaceholder('/usr/local/bin/pandoc')
          .setValue(this.plugin.settings.pandocPath)
          .onChange(async (value) => {
            this.plugin.settings.pandocPath = value;
            await this.plugin.saveSettings();
            await this.updatePandocStatus();
          })
      );
  }

  /**
   * Update the Pandoc status display.
   */
  private async updatePandocStatus(): Promise<void> {
    if (!this.pandocStatusEl) return;

    this.pandocStatusEl.setText('Checking...');

    try {
      const status = await this.plugin.recheckPandoc();

      if (status.installed) {
        const pathLabel = status.path ? ` at ${status.path}` : '';
        this.pandocStatusEl.setText(`Pandoc ${status.version} found${pathLabel}`);
        this.pandocStatusEl.style.color = 'var(--text-success)';
      } else {
        this.pandocStatusEl.setText('Pandoc not found. Please install from pandoc.org');
        this.pandocStatusEl.style.color = 'var(--text-error)';
      }
    } catch (error) {
      this.pandocStatusEl.setText('Error checking Pandoc');
      this.pandocStatusEl.style.color = 'var(--text-error)';
      console.error('PDF Auto Converter: Error checking Pandoc:', error);
    }
  }
}
