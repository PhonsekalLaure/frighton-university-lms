import type { Book } from '../data/books';

export function BookCover({ book, className = '' }: { book: Book; className?: string }) {
  return (
    <div className={`book-cover cover-${book.color} ${className}`} aria-label={`Decorative cover for ${book.title}`}>
      <span className="cover-mark">F<span>U</span></span>
      <span className="cover-rule" />
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
    </div>
  );
}
