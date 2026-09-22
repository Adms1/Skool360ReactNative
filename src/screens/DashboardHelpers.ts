
export const DOWNLOADABLE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.zip',
];

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm'];

export const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function getFileNameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0];
    const segments = clean.split('/');
    const last = decodeURIComponent(segments[segments.length - 1] || '');
    return last || `download_${Date.now()}`;
  } catch {
    return `download_${Date.now()}`;
  }
}

export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

export function guessMimeType(fileName: string): string {
  return MIME_TYPES[getExtension(fileName)] || 'application/octet-stream';
}

export function looksLikeDownload(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return DOWNLOADABLE_EXTENSIONS.some(ext => clean.endsWith(ext));
}

export function looksLikeVideo(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => clean.endsWith(ext));
}

export function resolveIntentUrl(url: string): string {
  try {
    if (url.includes('data=')) {
      const dataMatch = url.match(/data=([^;]+)/);
      if (dataMatch && dataMatch[1]) {
        return decodeURIComponent(dataMatch[1]);
      }
    }
    const match = url.match(/^intent:(?:\/\/\/)?(.*?)#Intent;(.*);?end$/i);
    if (!match) return url;

    const pathAndQuery = match[1];
    const params = match[2].split(';');
    let scheme = 'upi';
    params.forEach(p => {
      const [key, value] = p.split('=');
      if (key.trim() === 'scheme' && value) {
        scheme = decodeURIComponent(value.trim());
      }
    });

    return `${scheme}://${pathAndQuery}`;
  } catch {
    return url;
  }
}