import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { t } from '../views/i18n.ts';

export class ObsiBeansSettingTab extends PluginSettingTab {
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      type: 'group',
      heading: t('settings.project.heading'),
      items: [{ name: t('settings.project.binding'), desc: t('settings.project.notBound') }],
    }];
  }
}
