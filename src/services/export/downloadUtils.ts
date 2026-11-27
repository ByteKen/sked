export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function buildExportBaseFilename(workspaceTitle?: string | null): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safe = (workspaceTitle || 'sked-timeline')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safe || 'sked-timeline'}-${dateStamp}`;
}
