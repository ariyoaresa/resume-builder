import html2canvas from 'html2canvas';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import { formatExportFileName } from './index';

/**
 * Captures the resume container at high resolution and directly downloads an A4 PDF.
 * Bypasses the browser print popup completely across all templates.
 */
export const generatePdf = async (baseName?: string): Promise<void> => {
  const element = document.getElementById('resume-container');
  if (!element) {
    throw new Error('Resume template element not found');
  }

  // Find parent with zoom transform if present and temporarily normalize
  const parentWithTransform = element.parentElement;
  const originalTransform = parentWithTransform ? parentWithTransform.style.transform : '';
  const originalTransition = parentWithTransform ? parentWithTransform.style.transition : '';

  // Store original src for any external cross-origin images
  const images = Array.from(element.querySelectorAll('img'));
  const originalImgSources = new Map<HTMLImageElement, string>();

  try {
    if (parentWithTransform) {
      parentWithTransform.style.transition = 'none';
      parentWithTransform.style.transform = 'none';
    }

    // Proxy external images to prevent canvas tainting
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const imageLoadPromises: Promise<void>[] = [];

    images.forEach((img) => {
      const src = img.getAttribute('src') || img.src;
      if (
        src &&
        (src.startsWith('http://') || src.startsWith('https://')) &&
        !src.startsWith(origin) &&
        !src.includes('/api/proxy-image')
      ) {
        originalImgSources.set(img, src);
        const proxiedSrc = `/api/proxy-image?url=${encodeURIComponent(src)}`;

        const loadPromise = new Promise<void>((resolve) => {
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          tempImg.onload = () => {
            img.src = proxiedSrc;
            resolve();
          };
          tempImg.onerror = () => {
            // Keep original if proxy fails
            resolve();
          };
          tempImg.src = proxiedSrc;
        });

        imageLoadPromises.push(loadPromise);
      }
    });

    // Wait for proxied images and layout to settle (max 1.5s)
    await Promise.race([
      Promise.all(imageLoadPromises),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 80));

    let imgData: string | null = null;

    // Strategy 1: html2canvas with allowTaint: false and useCORS: true
    try {
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 4000,
      });
      imgData = canvas.toDataURL('image/jpeg', 0.98);
    } catch (h2cError) {
      console.warn('html2canvas capture error, trying html-to-image fallback:', h2cError);
    }

    // Strategy 2: html-to-image if html2canvas failed
    if (!imgData) {
      try {
        imgData = await toJpeg(element, {
          quality: 0.98,
          pixelRatio: 2.5,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });
      } catch (h2iError) {
        console.warn('html-to-image error, trying skipFonts mode:', h2iError);
        imgData = await toJpeg(element, {
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
        });
      }
    }

    if (!imgData) {
      throw new Error('Failed to render resume canvas');
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

    const fileName = formatExportFileName(baseName ? `Resume_${baseName}` : 'Resume', 'pdf');
    pdf.save(fileName);
  } finally {
    // Restore original image sources
    originalImgSources.forEach((origSrc, img) => {
      img.src = origSrc;
    });

    // Restore zoom transform
    if (parentWithTransform) {
      parentWithTransform.style.transform = originalTransform;
      parentWithTransform.style.transition = originalTransition;
    }
  }
};
