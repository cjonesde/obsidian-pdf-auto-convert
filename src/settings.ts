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
  private markerStatusEl: HTMLElement | null = null;

  constructor(app: App, plugin: PdfConverterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Marker status section
    new Setting(containerEl).setName('Marker').setHeading();

    this.createMarkerStatusSetting(containerEl);

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
   * Create Marker status and path settings.
   */
  private createMarkerStatusSetting(containerEl: HTMLElement): void {
    const statusSetting = new Setting(containerEl)
      .setName('Status')
      .setDesc('Checking Marker installation...');

    this.markerStatusEl = statusSetting.descEl;
    this.updateMarkerStatus();

    const pathHint = Platform.isMacOS
      ? 'Run "which marker" in Terminal to find the path.'
      : Platform.isWin
        ? 'Run "Get-Command marker" in PowerShell to find the path.'
        : 'Run "which marker" in a terminal to find the path.';

    new Setting(containerEl)
      .setName('Marker path')
      .setDesc(`Leave empty to use system PATH. ${pathHint}`)
      .addText((text) =>
        text
          .setPlaceholder('/usr/local/bin/marker')
          .setValue(this.plugin.settings.markerPath)
          .onChange(async (value) => {
            this.plugin.settings.markerPath = value;
            await this.plugin.saveSettings();
            await this.updateMarkerStatus();
          })
      );
  }

  /**
   * Update the Marker status display.
   */
  private async updateMarkerStatus(): Promise<void> {
    if (!this.markerStatusEl) return;

    this.markerStatusEl.setText('Checking...');

    try {
      const status = await this.plugin.recheckMarker();

      if (status.installed) {
        const pathLabel = status.path ? ` at ${status.path}` : '';
        this.markerStatusEl.setText(`Marker ${status.version} found${pathLabel}`);
        this.markerStatusEl.style.color = 'var(--text-success)';
      } else {
        this.markerStatusEl.setText('Marker not found. Please install marker-pdf.');
        this.markerStatusEl.style.color = 'var(--text-error)';
      }
    } catch (error) {
      this.markerStatusEl.setText('Error checking Marker');
      this.markerStatusEl.style.color = 'var(--text-error)';
      console.error('PDF Auto Converter: Error checking Marker:', error);
    }
  }
}
