// The Nectar services list as a design-system menu in the dashboard bar;
// each item is a link to another site.
import {
  Button,
  ChevronDown,
  Menu,
  MenuItem,
  MenuTrigger,
} from "@ardc-ui/react";
import { SERVICE_MENU } from "../links";

export function ServicesMenu({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <MenuTrigger>
      <Button variant="link" size="sm" className={className}>
        {label}
        <ChevronDown aria-hidden="true" />
      </Button>
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
