export interface CatalogBook {
  id: string;
  title: string;
  author: string;
  category: string;
  year: number | null;
  available: number;
  total: number;
  shelf: string;
  active: boolean;
}

export interface SaveBookInput {
  title: string;
  author: string;
  category: string;
  year: number | null;
  total: number;
  shelf: string;
}
