/**
 * English UI messages, the default and only declared locale. Values use ICU MessageFormat;
 * a translation may reorder text but must keep each message's named arguments.
 */
export const en = {
  'workspace.title': 'Beans',
  'workspace.label': 'Beans workspace',
  'workspace.notBound': 'No Beans project is bound to this vault.',
  'command.openWorkspace': 'Open workspace',
  'settings.project.heading': 'Beans project',
  'settings.project.binding': 'Project binding',
  'settings.project.notBound': 'No Beans project is bound to this vault.',
} as const satisfies Record<string, string>;
