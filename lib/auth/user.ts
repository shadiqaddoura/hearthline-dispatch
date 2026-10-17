export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATIONS";
}
