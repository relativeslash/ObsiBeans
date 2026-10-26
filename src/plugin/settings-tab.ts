import { PluginSettingTab, type App, type Plugin, type SettingDefinitionItem } from 'obsidian';
import { SUPPORTED_BEANS_VERSION } from '../adapter/binding.ts';
import { t } from '../views/i18n.ts';
import { type BindingState, type ObsiBeansSettings, type SettingsHost } from './settings.ts';

/** The one-line, translated state of the project binding. */
export function describeBinding(state: BindingState): string {
  if (!state) return t('binding.checking');
  if (state.ok) return t('binding.bound', { version: state.value.version, taskRoot: state.value.taskRoot });
  const { code, ...values } = state.diagnostic;
  return t(`binding.${code}`, values);
}

const TEXT_KEYS: readonly string[] = ['executable', 'config'] satisfies (keyof ObsiBeansSettings)[];

export class ObsiBeansSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost;

  constructor(app: App, plugin: Plugin, host: SettingsHost) {
    super(app, plugin);
    this.host = host;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      type: 'group',
      heading: t('settings.project.heading'),
      items: [
        {
          name: t('settings.executable.name'),
          desc: t('settings.executable.desc', { version: SUPPORTED_BEANS_VERSION }),
          control: { type: 'text', key: 'executable', placeholder: t('settings.executable.placeholder') },
        },
        {
          name: t('settings.confirm.name'),
          desc: t('settings.confirm.desc'),
          action: () => {
            void this.host.confirmExecutable();
          },
        },
        {
          name: t('settings.config.name'),
          desc: t('settings.config.desc'),
          control: { type: 'text', key: 'config', placeholder: t('settings.config.placeholder') },
        },
        {
          name: t('settings.project.binding'),
          // The state changes while the tab is open; updating one row in place keeps focus in the text fields.
          render: (setting) => {
            const show = (): void => {
              setting.setName(t('settings.project.binding')).setDesc(describeBinding(this.host.binding));
            };
            show();
            return this.host.onBindingChange(show);
          },
        },
      ],
    }];
  }

  override getControlValue(key: string): unknown {
    return TEXT_KEYS.includes(key) ? this.host.settings[key as keyof ObsiBeansSettings] : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!TEXT_KEYS.includes(key) || typeof value !== 'string') return;
    this.host.settings[key as keyof ObsiBeansSettings] = value.trim();
    await this.host.saveSettings();
    await this.host.rebind();
  }
}
