export function buildReportActionUrl(assignmentId: string): string {
  return `/cong-viec/bao-cao/${assignmentId}`;
}

export function buildReportVersionPath(prefix: string, version: number, objectName: string): string {
  if (!prefix || !Number.isInteger(version) || version < 1 || !objectName || objectName.includes('/')) {
    throw new Error('INVALID_FINALIZED_PATH');
  }
  return `${prefix}v${version}/${objectName}`;
}
