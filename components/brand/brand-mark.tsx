"use client";

import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { VehicleTruckProfileFilled } from "@fluentui/react-icons";

const useStyles = makeStyles({
  mark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  small: { width: "28px", height: "28px", fontSize: "18px" },
  large: { width: "48px", height: "48px", fontSize: "30px" },
});

/** Hearthline's mark. Decorative: always pair it with the product name in text. */
export function BrandMark({ size = "small", className }: { size?: "small" | "large"; className?: string }) {
  const styles = useStyles();
  return (
    <span aria-hidden className={mergeClasses(styles.mark, styles[size], className)}>
      <VehicleTruckProfileFilled />
    </span>
  );
}
