import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Aggressive settings keep the final PDF small enough for a fast Storage upload.
const CAPTURE_SCALE = 1.25;
const PAGE_JPEG_QUALITY = 0.6;
const EVIDENCE_MAX_SIDE = 1280;
const EVIDENCE_JPEG_QUALITY = 0.6;

export const renderPagesToPdf = async (container: HTMLElement): Promise<jsPDF> => {
    const pages = container.querySelectorAll('.pdf-page');
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pages[i] as HTMLElement, {
            scale: CAPTURE_SCALE,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', PAGE_JPEG_QUALITY), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        canvas.width = 0;
        canvas.height = 0;
    }
    return pdf;
};

export const loadImageAsCompressedJpeg = (src: string): Promise<string> => new Promise((resolve, reject) => {
    if (!src) return reject(new Error('Missing image source'));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const scale = Math.min(1, EVIDENCE_MAX_SIDE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable for PDF image rendering'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', EVIDENCE_JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('Unable to load closure evidence image'));
    img.src = src;
});
