import { App, Platform, PluginSettingTab, Setting } from 'obsidian';
import type PdfConverterPlugin from './main';
import { ConverterType } from './types';

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
  private pdftotextStatusEl: HTMLElement | null = null;

  constructor(app: App, plugin: PdfConverterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Converter backend section
    new Setting(containerEl).setName('Converter backend').setHeading();

    new Setting(containerEl)
      .setName('Backend')
      .setDesc('Marker uses ML models for best quality but is resource-heavy. pdftotext is lightweight (text only, no images). Auto tries Marker first and falls back to pdftotext on timeout.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('marker', 'Marker')
          .addOption('pdftotext', 'pdftotext')
          .addOption('auto', 'Auto (Marker → pdftotext)')
          .setValue(this.plugin.settings.converter)
          .onChange(async (value) => {
            this.plugin.settings.converter = value as ConverterType;
            await this.plugin.saveSettings();
          })
      );

    // Marker status section
    new Setting(containerEl).setName('Marker').setHeading();

    this.createMarkerStatusSetting(containerEl);

    // pdftotext status section
    new Setting(containerEl).setName('pdftotext').setHeading();

    this.createPdftotextStatusSetting(containerEl);

    // Safeguards section
    new Setting(containerEl).setName('Safeguards').setHeading();

    new Setting(containerEl)
      .setName('Conversion timeout')
      .setDesc('Maximum time in seconds to allow a conversion to run before terminating the process.')
      .addText((text) =>
        text
          .setPlaceholder('120')
          .setValue(String(this.plugin.settings.conversionTimeout))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed > 0) {
              this.plugin.settings.conversionTimeout = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('File size warning')
      .setDesc('Skip auto-conversion for files larger than this (in MB). Set to 0 to disable. Large files can still be converted via right-click.')
      .addText((text) =>
        text
          .setPlaceholder('50')
          .setValue(String(this.plugin.settings.fileSizeWarningMB))
          .onChange(async (value) => {
            const parsed = parseFloat(value);
            if (!isNaN(parsed) && parsed >= 0) {
              this.plugin.settings.fileSizeWarningMB = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

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
   * Create pdftotext status and path settings.
   */
  private createPdftotextStatusSetting(containerEl: HTMLElement): void {
    const statusSetting = new Setting(containerEl)
      .setName('Status')
      .setDesc('Checking pdftotext installation...');

    this.pdftotextStatusEl = statusSetting.descEl;
    this.updatePdftotextStatus();

    const installHint = Platform.isMacOS
      ? 'Install with "brew install poppler".'
      : Platform.isWin
        ? 'Install poppler for Windows and add to PATH.'
        : 'Install with "apt install poppler-utils" or equivalent.';

    new Setting(containerEl)
      .setName('pdftotext path')
      .setDesc(`Leave empty to use system PATH. ${installHint}`)
      .addText((text) =>
        text
          .setPlaceholder('/usr/local/bin/pdftotext')
          .setValue(this.plugin.settings.pdftotextPath)
          .onChange(async (value) => {
            this.plugin.settings.pdftotextPath = value;
            await this.plugin.saveSettings();
            await this.updatePdftotextStatus();
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

  /**
   * Update the pdftotext status display.
   */
  private async updatePdftotextStatus(): Promise<void> {
    if (!this.pdftotextStatusEl) return;

    this.pdftotextStatusEl.setText('Checking...');

    try {
      const status = await this.plugin.recheckPdftotext();

      if (status.installed) {
        const pathLabel = status.path ? ` at ${status.path}` : '';
        this.pdftotextStatusEl.setText(`pdftotext found${pathLabel}`);
        this.pdftotextStatusEl.style.color = 'var(--text-success)';
      } else {
        this.pdftotextStatusEl.setText('pdftotext not found. Install poppler-utils for fallback support.');
        this.pdftotextStatusEl.style.color = 'var(--text-error)';
      }
    } catch (error) {
      this.pdftotextStatusEl.setText('Error checking pdftotext');
      this.pdftotextStatusEl.style.color = 'var(--text-error)';
      console.error('PDF Auto Converter: Error checking pdftotext:', error);
    }
  }
}
