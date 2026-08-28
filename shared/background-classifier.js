// Shared by content.js (real product images) and popup.js (page-screenshot
// fallback). Both callers pass RGBA pixel data of the same shape (as
// returned by CanvasRenderingContext2D#getImageData), so the corner-color
// clustering and gray-background thresholds only need to be tuned once.
(function (root) {
  function classifyBackgroundPixels(pixels, width, height) {
    const border = [];
    const band = Math.max(2, Math.round(Math.min(width, height) * 0.08));
    const step = Math.max(1, Math.floor((width * height) / 3500));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (x >= band && x < width - band && y >= band && y < height - band) continue;
        const index = (y * width + x) * 4;
        border.push([pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]);
      }
    }
    if (!border.length) return { code: "no_pixels" };

    const opaque = border.filter(pixel => pixel[3] > 220);
    if (opaque.length < border.length * 0.8) return { code: "transparent" };

    const cornerSize = Math.max(3, Math.round(Math.min(width, height) * 0.12));
    const cornerOrigins = [
      [0, 0],
      [width - cornerSize, 0],
      [0, height - cornerSize],
      [width - cornerSize, height - cornerSize]
    ];
    const cornerMeans = cornerOrigins.map(([startX, startY]) => {
      const samples = [];
      for (let y = startY; y < startY + cornerSize; y += 1) {
        for (let x = startX; x < startX + cornerSize; x += 1) {
          const index = (y * width + x) * 4;
          if (pixels[index + 3] > 220) samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
        }
      }
      return [0, 1, 2].map(channel => samples.reduce((sum, pixel) => sum + pixel[channel], 0) / Math.max(samples.length, 1));
    });
    const colorDistance = (first, second) => Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
    const dominantCorners = cornerMeans
      .map(seed => cornerMeans.filter(corner => colorDistance(seed, corner) <= 34))
      .sort((first, second) => second.length - first.length)[0];
    const mean = [0, 1, 2].map(channel => dominantCorners.reduce((sum, pixel) => sum + pixel[channel], 0) / dominantCorners.length);
    const closeRatio = opaque.filter(pixel => colorDistance(pixel, mean) <= 42).length / opaque.length;
    const isPlainBackground = dominantCorners.length >= 3 || (dominantCorners.length >= 2 && closeRatio >= 0.52);
    if (!isPlainBackground) return { code: "scene" };

    const brightness = (mean[0] + mean[1] + mean[2]) / 3;
    const chroma = Math.max(...mean) - Math.min(...mean);
    const targetDistance = Math.hypot(mean[0] - 232, mean[1] - 232, mean[2] - 232);
    const color = `#${mean.map(value => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const grayEnough = brightness >= 210 && brightness <= 246 && chroma <= 18 && targetDistance <= 42;
    return { code: grayEnough ? "gray_pass" : "color_mismatch", color };
  }

  root.EHAssistantBackgroundClassifier = { classifyBackgroundPixels };
})(typeof window !== "undefined" ? window : globalThis);
