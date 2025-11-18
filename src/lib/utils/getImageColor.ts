

// Browser-based fallback method
export async function getImageColor(
  imageUrl: string,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('rgb(100, 100, 100)'); // Color por defecto en caso de error
        return;
      }
      // Resize canvas to max 200x200 for faster processing
      const maxDim = 200;
      let scaledWidth = img.width;
      let scaledHeight = img.height;
      
      if (img.width > maxDim || img.height > maxDim) {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height);
        scaledWidth = Math.round(img.width * ratio);
        scaledHeight = Math.round(img.height * ratio);
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
      }
      
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      // Read all pixel data once instead of repeated getImageData calls
      const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
      const pixelData = imageData.data;
      const samples: { r: number; g: number; b: number; lum: number }[] = [];
      const numPixels = 2000; // Reduced from 10000 for better performance

      // Sample every Nth pixel instead of random sampling
      const step = Math.max(1, Math.floor((pixelData.length / 4) / numPixels));
      
      for (let i = 0; i < pixelData.length; i += step * 4) {
        const pr = pixelData[i];
        const pg = pixelData[i + 1];
        const pb = pixelData[i + 2];
        
        // Descarta blancos y negros
        if (
          !(pr > 240 && pg > 240 && pb > 240) && // no blanco
          !(pr < 15 && pg < 15 && pb < 15) // no negro
        ) {
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          samples.push({ r: pr, g: pg, b: pb, lum });
        }
      }

      // Ordena por luminosidad descendente y toma los más claros
      samples.sort((a, b) => b.lum - a.lum);
      const selected = samples.slice(0, Math.min(samples.length, 500));

      // Calculate average color from selected samples
      let r = 0,
        g = 0,
        b = 0;
      for (const s of selected) {
        r += s.r;
        g += s.g;
        b += s.b;
      }

      const divisor = selected.length || 1;
      r = Math.round(r / divisor);
      g = Math.round(g / divisor);
      b = Math.round(b / divisor);

      // Ajustar brillo si es necesario
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const minLum = 180; // Umbral de luminosidad para considerar "brillante"
      if (lum < minLum) {
        // Calcula el factor para alcanzar el brillo deseado
        const factor = minLum / (lum || 1);
        r = Math.min(255, Math.round(r * factor));
        g = Math.min(255, Math.round(g * factor));
        b = Math.min(255, Math.round(b * factor));
      }

      resolve(`rgb(${[r, g, b].join(', ')})`)
    };
    img.onerror = () => {
      // Ignora errores de CORS y retorna color por defecto
      resolve('rgb(100, 100, 100)');
    };
    img.src = imageUrl;
  });
}
