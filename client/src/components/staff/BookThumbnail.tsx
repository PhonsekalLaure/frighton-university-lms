import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { BookRecord } from '../../types/library';
import { apiBase } from '../../services/api';
import { coverTone } from '../../utils/library';

export function BookThumbnail({ book }: { book: BookRecord }) {
  const version = useMemo(() => Date.now(), [book]);
  const src = apiBase + '/v1/books/' + encodeURIComponent(book.id) + '/image?v=' + version;
  const [failedUrl, setFailedUrl] = useState('');
  return <span className={'book-mini-cover cover-' + coverTone(book.id)}>
    {book.hasImage && failedUrl !== src ? <img src={src} alt={'Cover of ' + book.title} loading="lazy" onError={() => setFailedUrl(src)}/> : <BookOpen size={16}/>}
  </span>;
}
