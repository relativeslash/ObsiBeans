// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { A, B, C, backend, bean, detail, loaded } from '../state/support.ts';
import { open, settle } from './ui.ts';

const rows = () => [bean(A, { title: 'Alpha' }), bean(B, { title: 'Beta' }), bean(C, { title: 'Gamma' })];

async function ready() {
  const made = await loaded(rows());
  const ui = await open(made);
  const bulk = (): HTMLElement => ui.q('[aria-label="Edit selected beans"]');
  const tick = async (id: string): Promise<void> => { ui.q<HTMLInputElement>(`input[aria-label="Select ${id}"]`).click(); await settle(); };
  const text = (): string => bulk().textContent.replace(/\s+/g, ' ');
  const apply = async (label: string): Promise<void> => { ui.buttonIn('[aria-label="Edit selected beans"]', label).click(); await settle(); };
  return { ...ui, made, bulk, tick, text, apply };
}

describe('bulk editing view', () => {
  it('shows nothing until a bean is selected, then the explicit target count with hidden beans', async () => {
    const ui = await ready();
    expect(ui.el.querySelector('[aria-label="Edit selected beans"]')).toBeNull();

    await ui.tick(A);
    await ui.tick(B);
    expect(ui.text()).toContain('2 beans will be changed');

    ui.made.state.setFilters({ search: 'gamma' });
    await settle();
    expect(ui.text()).toContain('2 beans will be changed (2 hidden by filters)');
  });

  it('applies only after a value is chosen, and reports each bean, so a partial failure is visible and retried alone', async () => {
    const ui = await ready();
    await ui.tick(A);
    await ui.tick(B);
    const apply = ui.buttonIn('[aria-label="Edit selected beans"]', 'Apply to 2 beans');
    expect(apply.disabled).toBe(true);

    await ui.choose(ui.q<HTMLSelectElement>('.bulk label:nth-of-type(2) select'), 'draft');
    expect(apply.disabled).toBe(false);
    await ui.apply('Apply to 2 beans');
    expect(ui.text()).toContain('0 saved, 0 already had the value, 0 not saved, 2 waiting');

    await ui.answer(0, { ok: true, value: detail(A, { status: 'draft' }) });
    await ui.answer(1, { ok: false, error: backend('timeout', 'slow') });

    expect(ui.text()).toContain('1 saved, 0 already had the value, 1 not saved, 0 waiting, 0 not run.');
    expect(ui.text()).toContain(`${B} Beta: Beans failed: slow`);
    expect(ui.made.port.mutations).toHaveLength(2);

    await ui.apply('Retry 1 bean not saved');
    ui.made.port.lastList.settle({ ok: true, value: { beans: rows(), invalid: [], blockedIds: [], readyIds: [] } });
    await settle();
    expect(ui.made.port.mutations).toHaveLength(3);
    expect(ui.made.port.mutations[2]?.args[0]).toBe(B);
    await ui.answer(2, { ok: true, value: detail(B, { status: 'draft' }) });

    expect(ui.text()).toContain('2 saved');
    await ui.apply('Close results');
    expect(ui.text()).toContain('2 beans will be changed');
  });

  it('lets the selection be reviewed and reduced before applying', async () => {
    const ui = await ready();
    await ui.tick(A);
    await ui.tick(B);

    ui.q<HTMLElement>('.bulk summary').click();
    await settle();
    expect(ui.text()).toContain(`${A} Alpha`);
    expect(ui.text()).toContain(`${B} Beta`);

    ui.buttonIn('.bulk', `Remove ${B} from the selection`).click();
    await settle();
    expect(ui.text()).toContain('1 bean will be changed');
    expect(ui.made.state.getSnapshot().selection.ids).toEqual([A]);
  });

  it('stops after the current bean and says how many did not run', async () => {
    const ui = await ready();
    await ui.tick(A);
    await ui.tick(B);
    await ui.choose(ui.q<HTMLSelectElement>('.bulk label:nth-of-type(2) select'), 'draft');
    await ui.apply('Apply to 2 beans');

    await ui.apply('Stop after the current bean');
    expect(ui.text()).toContain('1 waiting, 1 not run.');
    expect(ui.text()).toContain('Stopping.');
    await ui.answer(0, { ok: true, value: detail(A, { status: 'draft' }) });

    expect(ui.text()).toContain('1 saved, 0 already had the value, 0 not saved, 0 waiting, 1 not run.');
    expect(ui.made.port.mutations).toHaveLength(1);
    expect(ui.buttonIn('.bulk', 'Retry 1 bean not saved').disabled).toBe(false);
  });

  it('picks one parent for the whole selection, with "No parent" as an explicit choice', async () => {
    const made = await loaded([bean(A, { type: 'epic', title: 'Epic' }), bean(B, { title: 'Beta' }), bean(C, { title: 'Gamma' })]);
    const ui = await open(made);
    ui.q<HTMLInputElement>(`input[aria-label="Select ${B}"]`).click();
    ui.q<HTMLInputElement>(`input[aria-label="Select ${C}"]`).click();
    await settle();
    await ui.choose(ui.q<HTMLSelectElement>('.bulk label select'), 'parent');
    const apply = ui.buttonIn('.bulk', 'Apply to 2 beans');
    expect(apply.disabled).toBe(true);

    ui.buttonIn('.bulk', 'To: none chosen. Choose a parent').click();
    await settle();
    expect([...ui.el.querySelectorAll('.bulk .picker li button')].map((one) => one.textContent.replace(/\s+/g, ' ').trim())).toEqual(['No parent', `${A} Epic (epic)`]);
    ui.buttonIn('.bulk .picker', `${A} Epic (epic)`).click();
    await settle();
    expect(apply.disabled).toBe(false);
    apply.click();
    await settle();

    expect(made.port.mutations.map((call) => call.args)).toEqual([[B, `rev-${B}`, { kind: 'parent', parentId: A }]]);
    expect(ui.q('.bulk').textContent).toContain('Setting Parent to');
  });
});
