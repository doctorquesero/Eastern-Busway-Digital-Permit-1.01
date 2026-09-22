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
