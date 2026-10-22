import { ChevronLeft, ChevronRight } from 'lucide-react';

export const TABLE_PAGE_SIZE = 8;

export function TablePagination({ count, page, pageSize = TABLE_PAGE_SIZE, onPageChange }: { count: number; page: number; pageSize?: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstItem = count === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, count);

  return <nav className="table-pagination" aria-label="Table pages">
    <span>Showing {firstItem}–{lastItem} of {count}</span>
    <div>
      <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}><ChevronLeft size={16}/></button>
      <span>Page <strong>{currentPage}</strong> of {pageCount}</span>
      <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}><ChevronRight size={16}/></button>
    </div>
  </nav>;
}
