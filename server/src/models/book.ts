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
  hasImage: boolean;
}

export interface SaveBookInput {
  // Omitted on update preserves the existing cover; data replaces it.
  image?: { data: string; contentType: string };
  title: string;
  author: string;
  category: string;
  year: number;
  total: number;
  shelf: string;
}
