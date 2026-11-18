export const DOWNLOADABLE_EXTENSIONS = [
  // documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.zip',
  '.txt', '.rtf', '.rar', '.7z',
  // images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  // audio
  '.mp3', '.wav', '.m4a', '.aac', '.ogg',
  // video
  '.mp4', '.mov', '.m4v', '.webm', '.3gp',
];

// Used only where the app plays a video itself (library "view file"); links in pages are downloaded.
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm'];

// File storage hosts: a link to one of these is always a file, even when the address has no extension
export const FILE_HOSTS = ['amazonaws.com', 'cloudfront.net'];

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
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
};

export function getFileNameFromUrl(url: string, nameHint?: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const segments = clean.split('/');
    const last = decodeURIComponent(segments[segments.length - 1] || '');
    // the address has no file extension (e.g. a storage key): use the link's own name when it has one
    if (last && !/\.[A-Za-z0-9]{2,5}$/.test(last) && nameHint && /\.[A-Za-z0-9]{2,5}$/.test(nameHint.trim())) {
      return nameHint.trim().replace(/[\\/:*?"<>|]/g, '_');
    }
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

function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].toLowerCase() : '';
}

export function isFileHostUrl(url: string): boolean {
  const host = hostOf(url);
  return !!host && FILE_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// A link that points to a file (by extension, or because it lives on the file storage host)
export function looksLikeDownload(url: string): boolean {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  return DOWNLOADABLE_EXTENSIONS.some(ext => clean.endsWith(ext)) || isFileHostUrl(url);
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