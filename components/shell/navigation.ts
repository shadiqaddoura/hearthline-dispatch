import {
  ArrowSyncFilled,
  ArrowSyncRegular,
  BoxMultipleFilled,
  BoxMultipleRegular,
  DocumentArrowUpFilled,
  DocumentArrowUpRegular,
  MapFilled,
  MapRegular,
  TagMultipleFilled,
  TagMultipleRegular,
  VehicleTruckProfileFilled,
  VehicleTruckProfileRegular,
  bundleIcon,
  type FluentIcon,
} from "@fluentui/react-icons";

interface DestinationBase {
  value: string;
  label: string;
  /** Filled when selected, regular otherwise. */
  icon: FluentIcon;
  section: "Operations" | "Stock and Configuration" | "Data";
}

/** Built and routable. */
export interface AvailableDestination extends DestinationBase {
  status: "available";
  href: `/${string}`;
}

/** Shown so the shape of the app is visible, but deliberately not linked. */
export interface PlannedDestination extends DestinationBase {
  status: "planned";
}

export type NavDestination = AvailableDestination | PlannedDestination;

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    value: "dispatch",
    label: "Dispatch",
    icon: bundleIcon(MapFilled, MapRegular),
    section: "Operations",
    status: "available",
    href: "/dispatch",
  },
  {
    value: "fleet",
    label: "Fleet",
    icon: bundleIcon(VehicleTruckProfileFilled, VehicleTruckProfileRegular),
    section: "Stock and Configuration",
    status: "available",
    href: "/fleet",
  },
  {
    value: "inventory",
    label: "Inventory",
    icon: bundleIcon(BoxMultipleFilled, BoxMultipleRegular),
    section: "Stock and Configuration",
    status: "available",
    href: "/inventory",
  },
  {
    value: "products",
    label: "Products Catalog",
    icon: bundleIcon(TagMultipleFilled, TagMultipleRegular),
    section: "Stock and Configuration",
    status: "available",
    href: "/products",
  },
  {
    value: "restocking",
    label: "Restocking",
    icon: bundleIcon(ArrowSyncFilled, ArrowSyncRegular),
    section: "Operations",
    status: "available",
    href: "/restocking",
  },
  {
    value: "imports",
    label: "Imports",
    icon: bundleIcon(DocumentArrowUpFilled, DocumentArrowUpRegular),
    section: "Data",
    status: "planned",
  },
];

export const NAV_SECTIONS = ["Operations", "Stock and Configuration", "Data"] as const;

/** The built destination whose route contains this path, if any. */
export function destinationForPath(pathname: string): AvailableDestination | undefined {
  return NAV_DESTINATIONS.find(
    (d): d is AvailableDestination =>
      d.status === "available" && (pathname === d.href || pathname.startsWith(`${d.href}/`)),
  );
}
