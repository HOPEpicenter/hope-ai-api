export type VisitorStatus =
  | "new"
  | "engaged"
  | "in_formation"
  | "completed"
  | "inactive"

export interface Visitor {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  status: VisitorStatus
  tags: string[]
  notes?: string
  source?: string
  createdAt: string
  updatedAt: string
}

export interface CreateVisitorRequest {
  firstName: string
  lastName: string
  email: string
  phone?: string
  source?: string
}

export interface CreateVisitorResponse {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  status: VisitorStatus
  createdAt: string
}
