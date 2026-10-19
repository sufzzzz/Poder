import { boot } from './boot';

/** 附件在发出前的本地状态。图片走 prompt.images，其它文件上传到 VPS 后把路径写进正文。 */
export type AttachStatus = 'reading' | 'uploading' | 'ready' | 'error';

export interface AttachedItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
  status: AttachStatus;
  /** 图片：预览用 data URL */
  previewUrl?: string;
  /** 图片：随 prompt 发送的 base64（不含 data: 前缀） */
  base64?: string;
  /** 非图片：上传到 VPS 后的绝对路径 */
  path?: string;
  error?: string;
}

/** 单张图片压缩后的最长边，避免把整张手机原图塞进请求。 */
const IMAGE_MAX_EDGE = 1600;
const IMAGE_QUALITY = 0.86;
/** 单个附件上限，与服务端一致。 */
export const ATTACH_MAX_BYTES = 40 * 1024 * 1024;

const IMAGE_NAME = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

export function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_NAME.test(file.name || '');
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let counter = 0;
export function newAttachmentId(): string {
  counter += 1;
  return `att-${Date.now().toString(36)}-${counter}`;
}

/** 把图片缩到最长边 1600px 并转成 JPEG，手机原图也能安全发出。 */
export async function prepareImage(file: File): Promise<{ base64: string; previewUrl: string; mime: string }> {
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);
  if (!img) {
    // HEIC 之类浏览器解不出来的格式：原样发，至少桌面端还有机会处理
    return { base64: raw.slice(raw.indexOf(',') + 1), previewUrl: raw, mime: file.type || 'image/jpeg' };
  }
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: raw.slice(raw.indexOf(',') + 1), previewUrl: raw, mime: file.type || 'image/jpeg' };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl, mime: 'image/jpeg' };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 把附件内容传到网关，落在桌面端同一台机器的目录里，再把绝对路径给模型。 */
export async function uploadAttachment(body: Blob, fileName: string): Promise<{ path: string; name: string; size: number }> {
  const res = await fetch(`${boot.base}/api/admin/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(fileName || 'file')
    },
    body
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; name?: string; size?: number; error?: string };
  if (!res.ok || !data.ok || !data.path) throw new Error(data.error || `上传失败（${res.status}）`);
  return { path: data.path, name: data.name || fileName, size: data.size ?? body.size };
}

/** base64 → Blob，用于把压缩后的图片也落到磁盘，模型想按路径读时不会扑空。 */
export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** 把「文件附件」拼成正文里的一小段，模型可以直接按路径读。 */
export function describeFiles(items: AttachedItem[]): string {
  const files = items.filter((item) => item.kind === 'file' && item.status === 'ready' && item.path);
  if (!files.length) return '';
  const lines = files.map((item) => `- ${item.path} （${item.name}，${formatBytes(item.size)}）`);
  return `\n\n附件（已放在本机，可直接读取）：\n${lines.join('\n')}`;
}

export function toPromptImages(items: AttachedItem[]): { data: string; mimeType: string }[] {
  return items
    .filter((item) => item.kind === 'image' && item.status === 'ready' && item.base64)
    .map((item) => ({ data: item.base64 as string, mimeType: item.mime || 'image/jpeg' }));
}
