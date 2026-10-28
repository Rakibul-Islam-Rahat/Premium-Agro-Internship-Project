// Compress user-selected images before storing them in the local demo database.
// Production applications should upload the original files to authenticated object storage instead.
export async function imageToDataUrl(file, { maxBytes = 280 * 1024, maxDimension = 1280 } = {}) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MB.");

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close?.(); throw new Error("Image compression is not available in this browser."); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    for (const quality of [0.76, 0.62, 0.48, 0.36]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read the compressed image.")); reader.readAsDataURL(blob);
        });
        return { name: file.name, caption: file.name, type: "image/jpeg", dataUrl };
      }
    }
    throw new Error("This photo is still too large after compression. Choose a smaller image.");
  }

  // Fallback for older browsers; do not allow a large raw data URL into local storage.
  if (file.size > maxBytes) throw new Error("This browser cannot compress the image. Choose a file smaller than 280 KB.");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read the image.")); reader.readAsDataURL(file);
  });
  return { name: file.name, caption: file.name, type: file.type, dataUrl };
}
