// The Nectar services list as a design-system menu. The ARDC header and the
// dashboard bar both offer it; each item is a link to another site.
import {
  Button,
  ChevronDown,
  Menu,
  MenuItem,
  MenuTrigger,
} from "@ardc-ui/react";
import { SERVICE_MENU } from "../ArdcHeader/menu-data";

export function ServicesMenu({
  label,
  variant = "link",
  className,
}: {
  label: string;
  /** "secondary" is the outlined trigger of the ARDC header's nav row. */
  variant?: "link" | "secondary";
  className?: string;
}) {
  const trigger = (
    <>
      {label}
      <ChevronDown aria-hidden="true" />
    </>
  );
  return (
    <MenuTrigger>
      {variant === "secondary" ? (
        <Button variant="secondary" size="sm" className={className}>
          {trigger}
        </Button>
      ) : (
        <Button variant="link" size="sm" className={className}>
          {trigger}
        </Button>
      )}
      <Menu aria-label="Nectar services" placement="bottom end">
        {SERVICE_MENU.map((link) => (
          <MenuItem key={link.href} id={link.href} href={link.href}>
            {link.label}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
