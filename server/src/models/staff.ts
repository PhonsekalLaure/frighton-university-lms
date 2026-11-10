export interface StaffRecord {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  name: string;
  email: string;
  active: boolean;
  since: string;
  updatedAt?: string;
}

export interface CreateStaffInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  password: string;
  active?: boolean;
}

export interface UpdateStaffInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  email?: string;
  active?: boolean;
  password?: string;
}

export interface StaffFilters {
  page: number;
  pageSize: number;
  query?: string;
  status?: string;
}

