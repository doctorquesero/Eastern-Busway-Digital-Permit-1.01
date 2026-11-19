const PDF_IMAGE_MAX_WIDTH = 800;
const PDF_IMAGE_QUALITY = 0.6;

// Downscales a data URL or remote URL to a small JPEG via an off-screen canvas. Falls back to the original source on any failure.
export const downscaleImageSource = (src: string, maxWidth = PDF_IMAGE_MAX_WIDTH, quality = PDF_IMAGE_QUALITY): Promise<string> => {
    return new Promise((resolve) => {
        if (!src || typeof src !== 'string') return resolve(src);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onerror = () => resolve(src);
        image.onload = () => {
            try {
                const width = image.naturalWidth || image.width;
                const height = image.naturalHeight || image.height;
                if (!width || !height) return resolve(src);
                const scale = Math.min(1, maxWidth / width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(width * scale));
                canvas.height = Math.max(1, Math.round(height * scale));
                const context = canvas.getContext('2d');
                if (!context) return resolve(src);
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const result = canvas.toDataURL('image/jpeg', quality);
                canvas.width = 0;
                canvas.height = 0;
                resolve(result);
            } catch {
                resolve(src);
            }
        };
        image.src = src;
    });
};

// Returns a shallow copy of the permit whose photo fields are downscaled for PDF rendering only. Never persist the result.
export const compressPermitImagesForPdf = async <T extends Record<string, any>>(permit: T): Promise<T> => {
    const cache = new Map<string, string>();
    const sources = new Set<string>();
    if (Array.isArray(permit.photos)) {
        for (const photo of permit.photos) {
            if (photo?.url) sources.add(photo.url);
        }
    }
    for (const src of [permit.approverPhoto, permit.dailySignOffUrl, permit.crewRegistrationUrl]) {
        if (src) sources.add(src);
    }
    const uniqueSources = Array.from(sources);
    for (let i = 0; i < uniqueSources.length; i += 2) {
        await Promise.all(uniqueSources.slice(i, i + 2).map(async src => {
            cache.set(src, await downscaleImageSource(src));
        }));
    }
    const shrink = (src: string) => cache.get(src) ?? src;
    const copy: any = { ...permit };
    if (Array.isArray(permit.photos)) {
        copy.photos = permit.photos.map((photo: any) => photo && photo.url ? { ...photo, url: shrink(photo.url) } : photo);
    }
    if (permit.approverPhoto) copy.approverPhoto = shrink(permit.approverPhoto);
    if (permit.dailySignOffUrl) copy.dailySignOffUrl = shrink(permit.dailySignOffUrl);
    if (permit.crewRegistrationUrl) copy.crewRegistrationUrl = shrink(permit.crewRegistrationUrl);
    return copy as T;
};

export const compressImageToJpeg = (file: File, maxWidth = 1920, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Unable to read selected image.'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('This photo format cannot be decoded by the browser. Please choose the photo again from the iOS Photo Library.'));
            image.onload = () => {
                const scale = Math.min(1, maxWidth / image.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext('2d');
                if (!context) {
                    reject(new Error('Unable to prepare the selected image.'));
                    return;
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    });
};
