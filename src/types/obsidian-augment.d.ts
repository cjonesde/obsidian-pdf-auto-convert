import 'obsidian';

declare module 'obsidian' {
  interface Vault {
    /**
     * Get a configuration value from the vault
     * Note: This method exists at runtime but is not in the official types
     */
    getConfig(key: string): unknown;
  }
}
