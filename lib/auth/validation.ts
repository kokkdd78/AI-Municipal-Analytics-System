import { z } from "zod"

import { JEDDAH_DISTRICTS } from "../../constants/districts"

const districtIds = new Set(JEDDAH_DISTRICTS.map((district) => district.id))

const password = z.string().min(8).max(128)

const citizenRegistrationFields = {
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(1).max(64),
  districtId: z.string().refine((value) => districtIds.has(value), "Invalid district"),
  password,
  confirmPassword: z.string(),
} as const

function requireMatchingPasswords(
  value: { password: string; confirmPassword: string },
  context: z.RefinementCtx,
): void {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords do not match",
    })
  }
}

export const citizenRegistrationSchema = z
  .object(citizenRegistrationFields)
  .strict()
  .superRefine(requireMatchingPasswords)

export const citizenLoginSchema = z
  .object({
    phone: z.string().min(1).max(64),
    password: z.string().max(128),
  })
  .strict()

export const staffLoginSchema = z
  .object({
    employeeId: z.string().min(1).max(64),
    password: z.string().max(128),
  })
  .strict()

const citizenRegistrationOperationSchema = z
  .object({
    operation: z.literal("citizen-register"),
    ...citizenRegistrationFields,
  })
  .strict()

const citizenLoginOperationSchema = z
  .object({
    operation: z.literal("citizen-login"),
    phone: z.string().min(1).max(64),
    password: z.string().max(128),
  })
  .strict()

const staffLoginOperationSchema = z
  .object({
    operation: z.literal("staff-login"),
    employeeId: z.string().min(1).max(64),
    password: z.string().max(128),
  })
  .strict()

const signOutOperationSchema = z
  .object({
    operation: z.literal("sign-out"),
  })
  .strict()

/**
 * The only accepted POST body at /api/auth/municipal. The discriminant is the
 * sole selector for a municipal authentication operation.
 */
export const municipalAuthPostSchema = z.discriminatedUnion("operation", [
  citizenRegistrationOperationSchema,
  citizenLoginOperationSchema,
  staffLoginOperationSchema,
  signOutOperationSchema,
]).superRefine((value, context) => {
  if (value.operation === "citizen-register") requireMatchingPasswords(value, context)
})

export type MunicipalAuthPostOperation = z.infer<typeof municipalAuthPostSchema>
