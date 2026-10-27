import { Modal, type App } from 'obsidian';
import { mount, unmount } from 'svelte';
import ConvertDialog from './ConvertDialog.svelte';
import type { NoteTarget, WorkspaceHost } from './host.ts';
import LinkDialog from './LinkDialog.svelte';

/** An Obsidian modal whose content is one Svelte component, mounted when it opens and unmounted when it closes. */
class NoteModal extends Modal {
  private readonly render: (el: HTMLElement, close: () => void) => ReturnType<typeof mount>;
  private component: ReturnType<typeof mount> | undefined;

  constructor(app: App, render: NoteModal['render']) {
    super(app);
    this.render = render;
  }

  override onOpen(): void {
    this.component = this.render(this.contentEl, () => { this.close(); });
  }

  override onClose(): void {
    const component = this.component;
    this.component = undefined;
    if (component) void unmount(component);
  }
}

/** Confirms and creates a bean from the selection captured in `target`. */
export function openConvertDialog(app: App, host: WorkspaceHost, target: NoteTarget): Modal {
  const modal = new NoteModal(app, (el, onClose) => mount(ConvertDialog, { target: el, props: { host, target, onClose } }));
  modal.open();
  return modal;
}

/** Picks a bean and links it at the place captured in `target`. */
export function openLinkDialog(app: App, host: WorkspaceHost, target: NoteTarget): Modal {
  const modal = new NoteModal(app, (el, onClose) => mount(LinkDialog, { target: el, props: { host, target, onClose } }));
  modal.open();
  return modal;
}
