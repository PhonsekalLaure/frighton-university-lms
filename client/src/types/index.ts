export interface Book {
  id: string;
  isbn: string;
  title: string;
  author: string;
  category: string;
  availableCopies: number;
  totalCopies: number;
}

export interface PatronStatus {
  frightonId: string;
  name: string;
  email: string;
  role: string;
  academicStatus: string;
  department: string;
  canBorrow: boolean;
  activeHolds: any[];
}
