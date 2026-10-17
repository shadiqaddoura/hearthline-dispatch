export type DemoRole = "ADMIN" | "OPERATIONS";
export interface DemoAccount {
  role: DemoRole;
  name: string;
  email: string;
  /** Only an intentionally public demo fixture, never a private user credential. */
  password?: string;
}
