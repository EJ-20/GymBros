export type DateBucket = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get date range for a specific bucket
 * @param date - Reference date
 * @param bucket - Time bucket (day, week, month, year)
 * @returns Date range for the bucket
 */
export function getDateRange(date: Date, bucket: DateBucket): DateRange {
  const start = new Date(date);
  const end = new Date(date);

  switch (bucket) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      const day = start.getDay();
      const diff = start.getDate() - day;
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(diff + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

