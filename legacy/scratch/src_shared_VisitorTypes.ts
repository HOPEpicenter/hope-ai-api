export interface VisitorCreateBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface VisitorUpdateBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
  source?: string;
  tags?: string[];
}
