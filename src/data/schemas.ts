import { z } from "zod";

const rankTimeSchema = z.string().regex(/^\d{1,2}:\d{2}(?::\d{2})?$/);

export const RaceRankRecordSchema = z.object({
  distance: z.enum(["5k", "10k", "half-marathon", "marathon"]),
  age_group: z.string().regex(/^\d+$/),
  gender: z.enum(["male", "female"]),
  beginner: rankTimeSchema,
  novice: rankTimeSchema,
  intermediate: rankTimeSchema,
  advanced: rankTimeSchema,
  elite: rankTimeSchema,
});

export const RaceRanksSchema = z.array(RaceRankRecordSchema);

export type RaceRankRecord = z.infer<typeof RaceRankRecordSchema>;

export const ProductSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceProductId: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  currency: z.string().min(1),
  availability: z.string().min(1),
  imageUrl: z.string(),
  productUrl: z.string(),
  fetchedAt: z.iso.datetime(),
});

export const ProductSourceSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["ok", "error", "skipped"]),
  count: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export const ProductSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  totalProducts: z.number().int().nonnegative(),
  sources: z.array(ProductSourceSchema),
  products: z.array(ProductSchema),
});

export type Product = z.infer<typeof ProductSchema>;
export type ProductSnapshot = z.infer<typeof ProductSnapshotSchema>;
