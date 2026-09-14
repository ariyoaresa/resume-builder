import type { Dayjs } from 'dayjs/index';
import dayjs from 'dayjs';
import { MutableRefObject } from 'react';

export const dateParser = (dateValue: string | Dayjs | null, outputFormat = 'MMM YYYY') => {
  if (dateValue === null) return;
  const dayjsDate = dayjs(dateValue);
  return dayjsDate.format(outputFormat);
};

export const scrollToElement = (ref: MutableRefObject<HTMLDivElement | null>) => {
  ref.current?.scrollIntoView({
    behavior: 'smooth',
    block: 'end',
    inline: 'nearest',
  });
};

/**
 * Generates a clean, filesystem-safe filename without illegal characters like \ / : * ? " < > |
 */
export const formatExportFileName = (baseName?: string, extension?: string): string => {
  const sanitized =
    (baseName || 'Resume')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_') || 'Resume';

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  const finalName = `${sanitized}_${timestamp}`;
  return extension ? `${finalName}.${extension.replace(/^\./, '')}` : finalName;
};
