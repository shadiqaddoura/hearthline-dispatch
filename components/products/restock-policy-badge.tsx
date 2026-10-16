"use client";

import { Badge } from "@fluentui/react-components";
import type { ProductDto } from "@/lib/contracts/products";
import { summariseRestockPolicy } from "@/lib/products/catalogue";

export function RestockPolicyBadge({ product }: { product: ProductDto }) {
  const policy = summariseRestockPolicy(product);
  const color = policy.needsReview ? "warning" : policy.automatic ? "success" : "informative";
  return (
    <Badge appearance="tint" color={color} shape="rounded">
      {policy.label}
    </Badge>
  );
}
