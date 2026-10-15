import { z } from "zod";
import { VanStatus } from "@/generated/prisma/enums";
import { actorSchema, idSchema } from "./common";

export const updateVanRequest = z
  .object({
    status: z.enum(VanStatus).optional(),
    statusNote: z.string().trim().max(500).nullable().optional(),
    /** New driver, or null for no driver. Changing the driver never moves stock. */
    technicianId: idSchema.nullable().optional(),
    updatedBy: actorSchema,
  })
  .refine((body) => body.status !== undefined || body.technicianId !== undefined || body.statusNote !== undefined, {
    message: "Nothing to update",
  });

export type UpdateVanRequest = z.infer<typeof updateVanRequest>;

export interface VanDto {
  id: string;
  code: string;
  plate: string | null;
  zone: string | null;
  status: VanStatus;
  statusNote: string | null;
  isPool: boolean;
  locationId: string;
  technician: { id: string; name: string } | null;
}

export interface TechnicianDto {
  id: string;
  name: string;
  active: boolean;
  vanId: string | null;
}
