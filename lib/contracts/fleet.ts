import { z } from "zod";
import { VanStatus } from "@/generated/prisma/enums";
import { actorSchema, idSchema } from "./common";

const vehicleFields = {
  code: z.string().trim().min(1, "Identifier is required").max(50),
  plate: z.string().trim().min(1).max(50).nullable(),
  zone: z.string().trim().min(1).max(100).nullable(),
  status: z.enum(VanStatus),
  statusNote: z.string().trim().max(500).nullable(),
};
export const createVanRequest = z.object(vehicleFields).strict();
export type CreateVanRequest = z.infer<typeof createVanRequest>;

export const updateVanRequest = z
  .object({
    code: vehicleFields.code.optional(),
    plate: vehicleFields.plate.optional(),
    zone: vehicleFields.zone.optional(),
    status: z.enum(VanStatus).optional(),
    statusNote: z.string().trim().max(500).nullable().optional(),
    /** New driver, or null for no driver. Changing the driver never moves stock. */
    technicianId: idSchema.nullable().optional(),
    updatedBy: actorSchema,
  })
  .strict()
  .refine((body) => body.code !== undefined || body.plate !== undefined || body.zone !== undefined || body.status !== undefined || body.technicianId !== undefined || body.statusNote !== undefined, {
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
